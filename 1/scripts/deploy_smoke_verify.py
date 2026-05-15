#!/usr/bin/env python3
"""Render deployment + regression verification for Yuanxing.

Usage:
  python scripts/deploy_smoke_verify.py https://your-render-url
  python scripts/deploy_smoke_verify.py https://your-render-url --username USER --password PASS --strict-version --strict-regression

Read-only checks only. With credentials it verifies protected endpoints and confirms the
regression guard rules are deployed: Today Changes count/badge, warehouse available,
shipping preview route, diagnostics export, and no server-side route gaps.
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.error, urllib.request
from http.cookiejar import CookieJar
from typing import Any

EXPECTED_APP_VERSION = "V119-V518-RESTORE-SATISFIED-SHIP-PREVIEW-DIAG-PACK28"
EXPECTED_STATIC_VERSION = "119-v518_restore_satisfied_ship_preview_diag_pack28"

PUBLIC_PATHS = ["/health", "/api/health"]
PROTECTED_PATHS = [
    "/api/health/extended",
    "/api/health/smoke",
    "/api/health/api-schema",
    "/api/health/event-flow",
    "/api/health/release-readiness",
    "/api/health/operation-closed-loop",
    "/api/health/final-gap-report",
    "/api/health/final-evidence-bundle",
    "/api/health/postdeploy-evidence-report",
    "/api/health/local-write-loop-readiness",
    "/api/health/write-test-safety",
    "/api/today-changes/count",
    "/api/today-changes/badge",
    "/api/shipping",
    "/api/today",
    "/api/warehouse/action-status",
    "/api/diagnostics/summary",
    "/api/diagnostics/export",
]
REGRESSION_REQUIRED_ROUTES = [
    "/api/today-changes",
    "/api/today-changes/count",
    "/api/today-changes/badge",
    "/api/warehouse",
    "/api/warehouse/available-items",
    "/api/ship/preview",
    "/api/shipping",
    "/api/diagnostics/summary",
    "/api/diagnostics/export",
]


def make_opener() -> urllib.request.OpenerDirector:
    cookies = CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))


def request_json(opener, base: str, path: str, method: str = "GET", payload=None, timeout: int = 15):
    url = base.rstrip("/") + path
    data = None
    headers = {"User-Agent": "YuanxingDeployRegressionVerify/1.0"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    start = time.time()
    try:
        with opener.open(req, timeout=timeout) as r:
            raw = r.read(1_500_000).decode("utf-8", errors="ignore")
            elapsed_ms = round((time.time() - start) * 1000, 1)
            ctype = r.headers.get("Content-Type", "")
            parsed = None
            if "json" in ctype or raw.strip().startswith(("{", "[")):
                try:
                    parsed = json.loads(raw)
                except Exception:
                    parsed = None
            return {"ok": True, "status": r.status, "elapsed_ms": elapsed_ms, "json": parsed, "text": raw[:800]}
    except urllib.error.HTTPError as e:
        raw = e.read(4000).decode("utf-8", errors="ignore")
        return {"ok": False, "status": e.code, "elapsed_ms": round((time.time() - start) * 1000, 1), "text": raw[:800]}
    except Exception as e:
        return {"ok": False, "status": None, "elapsed_ms": round((time.time() - start) * 1000, 1), "error": str(e)}


def extract_versions(data):
    js = data.get("json") if isinstance(data, dict) else None
    if not isinstance(js, dict):
        return None, None
    app_v = js.get("app_version") or js.get("version")
    static_v = js.get("static_version")
    if not static_v and isinstance(js.get("checks"), dict):
        static_v = js.get("checks", {}).get("static_version")
    return app_v, static_v


def intish(v: Any) -> int:
    try:
        if v is None or v == "":
            return 0
        return int(float(str(v).replace(",", "")))
    except Exception:
        return 0


def items_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("items", "rows", "data", "products", "records", "changes", "results", "unplaced_items"):
        val = payload.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    for key in ("payload", "result", "today", "warehouse_available"):
        nested = items_from_payload(payload.get(key))
        if nested:
            return nested
    return []


def count_from_payload(payload: Any) -> int | None:
    if isinstance(payload, dict):
        for key in ("unplaced_count", "total_count", "count", "badge_count", "total", "items_count"):
            if key in payload:
                return intish(payload.get(key))
        summary = payload.get("summary") or payload.get("zone_summary")
        if isinstance(summary, dict):
            for key in ("unplaced_count", "total", "count", "all"):
                if key in summary:
                    return intish(summary.get(key))
    items = items_from_payload(payload)
    if items:
        return sum(max(1, intish(x.get("unplaced_qty") or x.get("available_qty") or x.get("remaining_qty") or x.get("qty") or 1)) for x in items)
    return None


def route_map_from(payload: Any) -> dict[str, bool]:
    if not isinstance(payload, dict):
        return {}
    routes = payload.get("routes")
    if isinstance(routes, dict):
        return {str(k): bool(v) for k, v in routes.items()}
    return {}


# release readiness endpoint + operation closed-loop + final-gap report are checked below
def verify_regression_rules(results: dict[str, dict[str, Any]], strict: bool) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []

    summary = results.get("/api/diagnostics/summary", {}).get("json")
    export = results.get("/api/diagnostics/export", {}).get("json")
    routes: dict[str, bool] = {}
    routes.update(route_map_from(summary))
    routes.update(route_map_from(export))
    missing = [r for r in REGRESSION_REQUIRED_ROUTES if routes.get(r) is False or (routes and r not in routes)]
    if missing:
        failures.append("regression required routes missing: " + ", ".join(missing))
    if not routes:
        warnings.append("diagnostics route map unavailable; cannot verify regression-required routes")

    today_count = count_from_payload(results.get("/api/today-changes/count", {}).get("json"))
    today_badge = count_from_payload(results.get("/api/today-changes/badge", {}).get("json"))
    if today_count is not None and today_badge is not None and today_count != today_badge:
        msg = f"Today Changes count/badge mismatch: count={today_count} badge={today_badge}"
        (failures if strict else warnings).append(msg)

    if isinstance(export, dict):
        raw = json.dumps(export, ensure_ascii=False)
        for token in ("version", "static_version", "routes", "recent_errors", "warnings"):
            if token not in export:
                warnings.append(f"diagnostics export missing key: {token}")
        if "regression_guard_rules" not in export:
            warnings.append("diagnostics export does not expose regression_guard_rules; deploy script falls back to route/count checks")
        if "yx_v452_max_repair" in raw:
            failures.append("diagnostics export contains old yx_v452_max_repair reference")

    readiness_payloads = []
    for readiness_path in ("/api/health/release-readiness", "/api/health/operation-closed-loop", "/api/health/final-gap-report", "/api/health/final-evidence-bundle",
    "/api/health/postdeploy-evidence-report",
    "/api/health/local-write-loop-readiness", "/api/health/write-test-safety"):
        payload = results.get(readiness_path, {}).get("json")
        if isinstance(payload, dict):
            readiness_payloads.append((readiness_path, payload))
            if payload.get("success") is False or payload.get("ready") is False:
                msg = f"{readiness_path} reports not ready"
                (failures if strict else warnings).append(msg)
            if payload.get("no_mutation") is not True:
                failures.append(f"{readiness_path} must be read-only/no_mutation")
    if not readiness_payloads:
        warnings.append("readiness/final-gap endpoints unavailable; cannot verify final deploy checklist")

    return failures, warnings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base_url")
    ap.add_argument("--username", default="")
    ap.add_argument("--password", default="")
    ap.add_argument("--strict-version", action="store_true", help="fail if version is not exactly V511")
    ap.add_argument("--strict-regression", action="store_true", help="fail on count/badge regression mismatches instead of warning")
    args = ap.parse_args()
    base = args.base_url.rstrip("/")
    opener = make_opener()
    failures: list[str] = []
    warnings: list[str] = []
    results: dict[str, dict[str, Any]] = {}

    print(f"Deploy verify target: {base}")
    print("Expected:", EXPECTED_APP_VERSION, EXPECTED_STATIC_VERSION)

    for path in PUBLIC_PATHS:
        res = request_json(opener, base, path)
        results[path] = res
        status = res.get("status")
        print(f"PUBLIC {path}: status={status} elapsed={res.get('elapsed_ms')}ms")
        if not res.get("ok") or status not in (200, 204):
            failures.append(f"public endpoint failed: {path} -> {status} {res.get('error') or res.get('text')}")
        app_v, static_v = extract_versions(res)
        if app_v or static_v:
            print(f"  versions: app={app_v} static={static_v}")
            if args.strict_version and app_v and app_v != EXPECTED_APP_VERSION:
                failures.append(f"{path} app version mismatch: {app_v}")
            if args.strict_version and static_v and static_v != EXPECTED_STATIC_VERSION:
                failures.append(f"{path} static version mismatch: {static_v}")

    if args.username or args.password:
        login = request_json(opener, base, "/api/login", method="POST", payload={"username": args.username, "password": args.password}, timeout=20)
        print(f"LOGIN /api/login: status={login.get('status')} elapsed={login.get('elapsed_ms')}ms")
        if not login.get("ok") or not (isinstance(login.get("json"), dict) and login["json"].get("success")):
            failures.append(f"login failed: {login.get('status')} {login.get('error') or login.get('text')}")
        else:
            print("  login ok")
            for path in PROTECTED_PATHS:
                res = request_json(opener, base, path, timeout=25)
                results[path] = res
                status = res.get("status")
                print(f"PROTECTED {path}: status={status} elapsed={res.get('elapsed_ms')}ms")
                if not res.get("ok") or status not in (200, 204):
                    failures.append(f"protected endpoint failed: {path} -> {status} {res.get('error') or res.get('text')}")
                app_v, static_v = extract_versions(res)
                if app_v or static_v:
                    print(f"  versions: app={app_v} static={static_v}")
                    if args.strict_version and app_v and app_v != EXPECTED_APP_VERSION:
                        failures.append(f"{path} app version mismatch: {app_v}")
                    if args.strict_version and static_v and static_v != EXPECTED_STATIC_VERSION:
                        failures.append(f"{path} static version mismatch: {static_v}")
            rf, rw = verify_regression_rules(results, strict=args.strict_regression)
            failures.extend(rf)
            warnings.extend(rw)
    else:
        warnings.append("No credentials supplied; protected regression endpoint checks are skipped. Add --username/--password for full smoke test.")

    if failures:
        print("\nDEPLOY REGRESSION VERIFY FAILED")
        for f in failures:
            print("-", f)
        if warnings:
            print("\nWARNINGS")
            for w in warnings:
                print("-", w)
        return 1
    if warnings:
        print("\nWARNINGS")
        for w in warnings:
            print("-", w)
    print("\nDEPLOY REGRESSION VERIFY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
