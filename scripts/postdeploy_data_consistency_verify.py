#!/usr/bin/env python3
"""Post-deploy read-only data consistency verification for Yuanxing.

Run after deploying to Render:
  python scripts/postdeploy_data_consistency_verify.py https://your-render-url --username USER --password PASS

It does not create/update/delete business data. It verifies that the deployed app can
read the same authoritative data used by the local-first frontend paths:
- inventory / orders / master_orders are reachable and normalized
- customers/counts can be derived from rows instead of stale relation_counts
- today changes unplaced count matches warehouse available items/summary when both exist
- warehouse endpoints return a valid payload instead of timing out/empty-error responses
"""
from __future__ import annotations
import argparse, json, sys, time, urllib.error, urllib.parse, urllib.request
from collections import defaultdict
from http.cookiejar import CookieJar
from typing import Any

EXPECTED_APP_VERSION = "V119-V517-FULL-CHECKLIST-ALIGNMENT-PACK27"
EXPECTED_STATIC_VERSION = "119-v517_full_checklist_alignment_pack27"

READ_ENDPOINTS = {
    "inventory": "/api/inventory?sync_full=1&verify=1",
    "orders": "/api/orders?sync_full=1&verify=1",
    "master_order": "/api/master_orders?sync_full=1&verify=1",
    "customers": "/api/customers?sync_full=1&verify=1",
    "today": "/api/today-changes?sync_full=1&verify=1",
    "today_count": "/api/today-changes/count?sync_full=1&verify=1",
    "today_badge": "/api/today-changes/badge?sync_full=1&verify=1",
    "warehouse": "/api/warehouse?sync_full=1&verify=1",
    "warehouse_available": "/api/warehouse/available-items?sync_full=1&verify=1",
    "shipping": "/api/shipping?sync_full=1&verify=1",
    "diagnostics_export": "/api/diagnostics/export",
    "release_readiness": "/api/health/release-readiness",
}


def make_opener() -> urllib.request.OpenerDirector:
    cookies = CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))


def request_json(opener, base: str, path: str, method: str = "GET", payload: Any = None, timeout: int = 25) -> dict[str, Any]:
    url = base.rstrip("/") + path
    data = None
    headers = {"User-Agent": "YuanxingPostDeployDataConsistency/1.0"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    start = time.time()
    try:
        with opener.open(req, timeout=timeout) as r:
            raw = r.read(1_500_000).decode("utf-8", errors="ignore")
            elapsed_ms = round((time.time() - start) * 1000, 1)
            js = None
            if raw.strip().startswith(("{", "[")) or "json" in r.headers.get("Content-Type", ""):
                try:
                    js = json.loads(raw)
                except Exception:
                    js = None
            return {"ok": True, "status": r.status, "elapsed_ms": elapsed_ms, "json": js, "text": raw[:500]}
    except urllib.error.HTTPError as e:
        raw = e.read(4000).decode("utf-8", errors="ignore")
        return {"ok": False, "status": e.code, "elapsed_ms": round((time.time() - start) * 1000, 1), "text": raw[:500]}
    except Exception as e:
        return {"ok": False, "status": None, "elapsed_ms": round((time.time() - start) * 1000, 1), "error": str(e)}


def items_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("items", "rows", "data", "products", "records", "customers", "changes", "results"):
        val = payload.get(key)
        if isinstance(val, list):
            return [x for x in val if isinstance(x, dict)]
    # Some endpoints wrap data again.
    for key in ("payload", "result"):
        val = payload.get(key)
        nested = items_from_payload(val)
        if nested:
            return nested
    return []


def first_int(*values: Any) -> int:
    for v in values:
        try:
            if v is None or v == "":
                continue
            return int(float(str(v).replace(",", "")))
        except Exception:
            continue
    return 0


def customer_of(row: dict[str, Any]) -> str:
    for key in ("customer", "customer_name", "client", "name", "customerName"):
        val = row.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return ""


def row_piece_count(row: dict[str, Any]) -> int:
    return first_int(row.get("pieces"), row.get("piece_count"), row.get("qty_pieces"), row.get("件數"), row.get("count"), 1) or 1


def summarize_customer_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = defaultdict(lambda: {"rows": 0, "pieces": 0})
    for r in rows:
        c = customer_of(r)
        if not c:
            continue
        out[c]["rows"] += 1
        out[c]["pieces"] += row_piece_count(r)
    return dict(out)


def payload_unplaced_count(payload: Any, items: list[dict[str, Any]]) -> int | None:
    if isinstance(payload, dict):
        for key in ("unplaced_count", "total_count", "count", "total", "items_count"):
            if key in payload:
                return first_int(payload.get(key))
        zone = payload.get("zone_summary") or payload.get("summary")
        if isinstance(zone, dict):
            vals = [zone.get(k) for k in ("total", "all", "count", "items", "A", "B", "未分區", "unassigned")]
            n = sum(first_int(v) for v in vals if v is not None)
            if n:
                return n
    if items:
        return sum(row_piece_count(x) for x in items)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base_url")
    ap.add_argument("--username", default="")
    ap.add_argument("--password", default="")
    ap.add_argument("--strict-version", action="store_true")
    ap.add_argument("--strict-regression", action="store_true", help="fail on Today/warehouse/customer-count regression warnings")
    ap.add_argument("--slow-ms", type=int, default=3500, help="warn when a read endpoint is slower than this")
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    opener = make_opener()
    failures: list[str] = []
    warnings: list[str] = []

    print(f"Post-deploy consistency target: {base}")
    health = request_json(opener, base, "/api/health", timeout=20)
    print(f"HEALTH /api/health: status={health.get('status')} elapsed={health.get('elapsed_ms')}ms")
    if not health.get("ok"):
        failures.append(f"/api/health failed: {health.get('status')} {health.get('error') or health.get('text')}")
    else:
        js = health.get("json") if isinstance(health.get("json"), dict) else {}
        app_v = js.get("app_version") or js.get("version")
        static_v = js.get("static_version")
        print(f"  version app={app_v} static={static_v}")
        if args.strict_version and app_v and app_v != EXPECTED_APP_VERSION:
            failures.append(f"app version mismatch: {app_v}")
        if args.strict_version and static_v and static_v != EXPECTED_STATIC_VERSION:
            failures.append(f"static version mismatch: {static_v}")

    if args.username or args.password:
        login = request_json(opener, base, "/api/login", method="POST", payload={"username": args.username, "password": args.password}, timeout=20)
        print(f"LOGIN /api/login: status={login.get('status')} elapsed={login.get('elapsed_ms')}ms")
        if not login.get("ok") or not (isinstance(login.get("json"), dict) and login["json"].get("success")):
            failures.append(f"login failed: {login.get('status')} {login.get('error') or login.get('text')}")
    else:
        warnings.append("No credentials supplied; protected data endpoints may return login/empty responses. Use --username/--password for full verification.")

    payloads: dict[str, Any] = {}
    item_sets: dict[str, list[dict[str, Any]]] = {}
    for name, path in READ_ENDPOINTS.items():
        res = request_json(opener, base, path, timeout=30)
        print(f"READ {name:20s} {path}: status={res.get('status')} elapsed={res.get('elapsed_ms')}ms")
        if res.get("elapsed_ms") and res["elapsed_ms"] > args.slow_ms:
            warnings.append(f"{name} read is slow: {res['elapsed_ms']}ms")
        if not res.get("ok") or res.get("status") not in (200, 204):
            failures.append(f"{name} endpoint failed: {res.get('status')} {res.get('error') or res.get('text')}")
            continue
        payloads[name] = res.get("json")
        items = items_from_payload(res.get("json"))
        item_sets[name] = items
        print(f"  normalized_items={len(items)}")

    # Customer row authority check: rows derived from orders/master_order must exist if row data exists.
    order_sum = summarize_customer_rows(item_sets.get("orders", []))
    master_sum = summarize_customer_rows(item_sets.get("master_order", []))
    print(f"DERIVED orders customers={len(order_sum)} master customers={len(master_sum)}")
    if item_sets.get("orders") and not order_sum:
        failures.append("orders endpoint returned rows but no customer names could be normalized")
    if item_sets.get("master_order") and not master_sum:
        failures.append("master_orders endpoint returned rows but no customer names could be normalized")

    # Customers endpoint must not be the only source of counts; compare when customers payload includes counts.
    customers = item_sets.get("customers", [])
    stale_count_examples = []
    for c in customers:
        name = customer_of(c)
        if not name:
            continue
        declared = first_int(c.get("pieces"), c.get("piece_count"), c.get("total_pieces"), c.get("count"), c.get("items_count"))
        derived = (order_sum.get(name, {}).get("pieces", 0) + master_sum.get(name, {}).get("pieces", 0))
        if declared and derived and abs(declared - derived) > max(2, int(max(declared, derived) * 0.2)):
            stale_count_examples.append((name, declared, derived))
        if len(stale_count_examples) >= 5:
            break
    if stale_count_examples:
        msg = "customer endpoint count differs from row-derived count; frontend must keep rows authoritative: " + str(stale_count_examples)
        (failures if args.strict_regression else warnings).append(msg)

    # Today unplaced count should match warehouse_available when both payloads expose a count.
    available_items = item_sets.get("warehouse_available", [])
    available_count = payload_unplaced_count(payloads.get("warehouse_available"), available_items)
    today_count = payload_unplaced_count(payloads.get("today_count"), item_sets.get("today_count", []))
    today_badge_count = payload_unplaced_count(payloads.get("today_badge"), item_sets.get("today_badge", []))
    today_payload_count = payload_unplaced_count(payloads.get("today"), item_sets.get("today", []))
    print(f"UNPLACED warehouse_available={available_count} today_count={today_count} today_badge={today_badge_count} today_payload={today_payload_count}")
    if today_count is not None and today_badge_count is not None and today_count != today_badge_count:
        msg = f"today count ({today_count}) differs from badge ({today_badge_count}); Today badge regression guard failed"
        (failures if args.strict_regression else warnings).append(msg)
    if available_count is not None and today_count is not None and available_count != today_count:
        msg = f"today count ({today_count}) differs from warehouse_available ({available_count}); verify Today Changes badge after sync"
        (failures if args.strict_regression else warnings).append(msg)
    if available_count is not None and today_payload_count is not None and available_count and today_payload_count == 0:
        msg = "today payload shows zero while warehouse_available has items; Today Changes page should use YXDataStore.getTodayWithUnplaced"
        (failures if args.strict_regression else warnings).append(msg)

    # Diagnostics export should expose server-side regression rule metadata.
    diag_export = payloads.get("diagnostics_export")
    if isinstance(diag_export, dict):
        routes = diag_export.get("routes") if isinstance(diag_export.get("routes"), dict) else {}
        required = ["/api/today-changes/count", "/api/today-changes/badge", "/api/warehouse", "/api/warehouse/available-items", "/api/ship/preview", "/api/diagnostics/export"]
        missing = [r for r in required if routes and not routes.get(r)]
        if missing:
            failures.append("diagnostics export missing regression routes: " + ", ".join(missing))
        if not diag_export.get("regression_guard_rules"):
            warnings.append("diagnostics export does not include regression_guard_rules metadata")
    else:
        warnings.append("diagnostics export unavailable for regression rule verification")

    readiness = payloads.get("release_readiness")
    if isinstance(readiness, dict):
        if readiness.get("ready") is False or readiness.get("success") is False:
            (failures if args.strict_regression else warnings).append("release readiness endpoint reports not ready")
        if readiness.get("no_mutation") is not True:
            failures.append("release readiness endpoint must be read-only/no_mutation")
    else:
        warnings.append("release readiness endpoint unavailable")

    # Warehouse must be valid JSON; empty warehouse is warning only because real data may be unplaced.
    if "warehouse" in payloads and not isinstance(payloads.get("warehouse"), (dict, list)):
        failures.append("warehouse endpoint did not return JSON object/list")
    if not item_sets.get("warehouse"):
        warnings.append("warehouse endpoint normalized to 0 items/cells; if you expect placed goods, inspect warehouse data and cache hydration")

    if failures:
        print("\nPOSTDEPLOY DATA CONSISTENCY VERIFY FAILED")
        for f in failures:
            print("-", f)
        if warnings:
            print("\nWARNINGS")
            for w in warnings:
                print("-", w)
        return 1

    print("\nPOSTDEPLOY DATA CONSISTENCY VERIFY OK")
    if warnings:
        print("WARNINGS")
        for w in warnings:
            print("-", w)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
