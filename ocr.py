import os
import re
import io
import base64
from difflib import get_close_matches

import requests
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from db import log_error, get_customers, get_setting, get_ocr_usage, increment_ocr_usage

GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY") or os.getenv("GOOGLE_API_KEY")


def datetime_now_month():
    from datetime import datetime
    return datetime.now().strftime("%Y-%m")


def _coerce_roi(roi):
    if not roi:
        return None
    try:
        x = float(roi.get("x", 0))
        y = float(roi.get("y", 0))
        w = float(roi.get("w", 0))
        h = float(roi.get("h", 0))
        if w <= 0 or h <= 0:
            return None
        return {"x": x, "y": y, "w": w, "h": h}
    except Exception:
        return None


def _open_and_crop(image_path, roi=None):
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img).convert("RGB")
    roi = _coerce_roi(roi)
    if roi:
        w0, h0 = img.size
        left = int(max(0, min(w0 - 1, roi["x"] * w0 if roi["x"] <= 1 else roi["x"])))
        top = int(max(0, min(h0 - 1, roi["y"] * h0 if roi["y"] <= 1 else roi["y"])))
        width = int(roi["w"] * w0 if roi["w"] <= 1 else roi["w"])
        height = int(roi["h"] * h0 if roi["h"] <= 1 else roi["h"])
        right = max(left + 1, min(w0, left + width))
        bottom = max(top + 1, min(h0, top + height))
        img = img.crop((left, top, right, bottom))
    return img


def _resize_for_ocr(img):
    if img.size[0] < 1600:
        scale = max(1, int(1600 / max(1, img.size[0])))
        img = img.resize((img.size[0] * scale, img.size[1] * scale))
    return img


def _mask_color(img, mode="blue"):
    out = []
    for r, g, b in img.getdata():
        if mode == "blue":
            score = int(b * 1.9 - r * 0.8 - g * 0.65)
            val = 255 if score > 55 and b > r + 15 and b > g + 15 else 0
        elif mode == "green":
            score = int(g * 1.9 - r * 0.75 - b * 0.8)
            val = 255 if score > 45 and g > r + 10 and g > b + 10 else 0
        elif mode == "handwriting":
            # handwriting-like dark strokes
            v = (r + g + b) // 3
            val = 255 if v < 185 else 0
        out.append(val)
    mask = Image.new("L", img.size)
    mask.putdata(out)
    mask = ImageOps.autocontrast(mask)
    mask = mask.filter(ImageFilter.MedianFilter(3))
    mask = ImageEnhance.Contrast(mask).enhance(3.0)
    return _resize_for_ocr(mask)


def preprocess_image(image_path, roi=None, mode="blue"):
    img = _open_and_crop(image_path, roi=roi)
    return _mask_color(img, mode=mode)


def _normalize_x(text):
    return (text or "").replace("×", "x").replace("X", "x").replace("＊", "x").replace("*", "x").replace("＝", "=")


def _normalize_no_space(text):
    return re.sub(r"\s+", "", _normalize_x(text or ""))


def _extract_chinese_candidates(text):
    candidates = []
    for raw in (text or "").splitlines():
        clean = re.sub(r"[^一-鿿]", "", raw or "")
        if len(clean) >= 2:
            candidates.append(clean)
    return candidates


def _guess_customer(raw_text):
    names = [r.get("name") for r in get_customers() if r.get("name")]
    normalized_text = _normalize_no_space(raw_text)
    alias_map = {"東升": "東昇", "东升": "東昇", "东昇": "東昇"}
    for base in names:
        if base and _normalize_no_space(base) in normalized_text:
            return base
    for alias, target in alias_map.items():
        if alias in normalized_text:
            return target

    candidates = _extract_chinese_candidates(raw_text)
    for cand in candidates:
        m = get_close_matches(cand, names, n=1, cutoff=0.5)
        if m:
            return m[0]
    return candidates[0] if candidates else ""


def _extract_item_rows(raw_text):
    rows = []
    prev_dims = None
    for raw in (raw_text or "").splitlines():
        line = re.sub(r"\s+", "", _normalize_x(raw))
        if not line or "=" not in line:
            continue
        left, right = line.split("=", 1)
        left_nums = [int(x) for x in re.findall(r"\d+", left)]
        if not left_nums:
            continue

        dims = None
        if len(left_nums) >= 3:
            dims = left_nums[:3]
        elif len(left_nums) == 2 and prev_dims:
            dims = [left_nums[0], left_nums[1], prev_dims[2]]
        elif len(left_nums) == 1 and prev_dims:
            dims = [left_nums[0], prev_dims[1], prev_dims[2]]

        if not dims:
            continue
        prev_dims = dims

        segments = [seg for seg in re.split(r"[+＋]", right) if seg]
        if not segments:
            segments = [right]
        for seg in segments:
            nums = [int(x) for x in re.findall(r"\d+", seg)]
            if not nums:
                continue
            rhs = nums[0]
            qty = nums[1] if len(nums) > 1 else 1
            line_out = f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}" + (f"x{qty}" if qty != 1 else "")
            rows.append({
                "line": line_out,
                "product_text": f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}",
                "product_code": f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}",
                "qty": qty,
                "dims": dims,
            })

    rows.sort(key=lambda r: (r["dims"][2], r["dims"][1], r["dims"][0], -(r["qty"] or 1), r["line"]))
    return rows


def _fallback_extract_lines(raw_text):
    raw_text = _normalize_x(raw_text or "")
    lines = []
    for raw in raw_text.splitlines():
        line = re.sub(r"\s+", "", raw)
        if line.count('x') >= 2 and '=' in line:
            line = re.sub(r'[^0-9x=+]', '', line)
            if line:
                lines.append(line)
    return lines


def _build_items_from_lines(lines):
    items = []
    for line in lines:
        clean = _normalize_x(line)
        if '=' not in clean:
            continue
        left, right = clean.split('=', 1)
        for seg in re.split(r"[+＋]", right):
            nums = [int(x) for x in re.findall(r"\d+", seg)]
            if not nums:
                continue
            rhs = nums[0]
            qty = nums[1] if len(nums) > 1 else 1
            items.append({
                "raw_text": f"{left}={rhs}" + (f"x{qty}" if qty != 1 else ""),
                "product_text": f"{left}={rhs}",
                "product_code": f"{left}={rhs}",
                "qty": qty,
            })
    return items

def parse_ocr_text(text):
    rows = _extract_item_rows(text or "")
    items = [{
        "raw_text": r["line"],
        "product_text": r["product_text"],
        "product_code": r["product_code"],
        "qty": r["qty"],
    } for r in rows]
    output_text = "\n".join(r["line"] for r in rows)
    if not output_text:
        fallback_lines = _fallback_extract_lines(text or "")
        items = _build_items_from_lines(fallback_lines)
        output_text = "\n".join(i["raw_text"] for i in items)
    return {"text": output_text, "lines": output_text.splitlines() if output_text else [], "items": items}

def _google_annotate_from_image(img):
    if not GOOGLE_VISION_API_KEY:
        return {"raw_text": "", "confidence": 0}
    try:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        content = base64.b64encode(buf.getvalue()).decode("utf-8")
        payload = {
            "requests": [{
                "image": {"content": content},
                "features": [
                    {"type": "DOCUMENT_TEXT_DETECTION"},
                    {"type": "TEXT_DETECTION"}
                ],
                "imageContext": {"languageHints": ["zh-TW", "zh", "en"]},
            }]
        }
        resp = requests.post(
            f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}",
            json=payload,
            timeout=30
        )
        data = resp.json()
        response = (data.get("responses") or [{}])[0]
        annotation = response.get("fullTextAnnotation") or {}
        raw_text = annotation.get("text", "")
        if not raw_text:
            raw_text = ((response.get("textAnnotations") or [{}])[0] or {}).get("description", "")
        confs = []
        for page in annotation.get("pages") or []:
            for block in page.get("blocks") or []:
                conf = block.get("confidence")
                if conf is not None:
                    confs.append(float(conf) * 100)
        confidence = int(sum(confs) / len(confs)) if confs else (88 if raw_text else 0)
        return {"raw_text": raw_text, "confidence": confidence}
    except Exception as e:
        log_error("google_annotate", e)
        return {"raw_text": "", "confidence": 0}

def _detect_template(image_path):
    try:
        img = _open_and_crop(image_path)
        small = img.resize((min(800, img.size[0]), int(img.size[1] * min(800, img.size[0]) / img.size[0])))
        gray = ImageOps.grayscale(small)
        bw = gray.point(lambda p: 255 if p < 130 else 0)
        # estimate form/table via horizontal/vertical dark line density
        w, h = bw.size
        rows = [sum(1 for x in range(w) if bw.getpixel((x, y)) > 0) / w for y in range(h)]
        cols = [sum(1 for y in range(h) if bw.getpixel((x, y)) > 0) / h for x in range(w)]
        strong_rows = sum(1 for r in rows if r > 0.45)
        strong_cols = sum(1 for c in cols if c > 0.28)
        if strong_rows >= 4 and strong_cols >= 4:
            return "shipping_note"
        return "whiteboard"
    except Exception:
        return "auto"


def _crop_relative(image_path, rect):
    img = _open_and_crop(image_path)
    w, h = img.size
    left = int(rect[0] * w)
    top = int(rect[1] * h)
    right = int(rect[2] * w)
    bottom = int(rect[3] * h)
    return img.crop((left, top, right, bottom))


def _template_default_roi(template):
    if template == "shipping_note":
        return {"x": 0.04, "y": 0.18, "w": 0.50, "h": 0.66}
    if template == "whiteboard":
        return {"x": 0.05, "y": 0.16, "w": 0.90, "h": 0.74}
    return None


def _extract_customer_by_template(image_path, template):
    try:
        if template == "whiteboard":
            img = _crop_relative(image_path, (0.02, 0.04, 0.55, 0.26))
            mask = _mask_color(img, mode="green")
        elif template == "shipping_note":
            img = _crop_relative(image_path, (0.0, 0.02, 0.33, 0.24))
            mask = _mask_color(img, mode="handwriting")
        else:
            mask = _mask_color(_open_and_crop(image_path), mode="blue")
        result = _google_annotate_from_image(mask)
        return _guess_customer(result.get("raw_text", ""))
    except Exception:
        return ""


def _extract_products_by_template(image_path, template, roi=None):
    try:
        applied_roi = roi or _template_default_roi(template)
        masks = []
        if template == "whiteboard":
            masks = [preprocess_image(image_path, roi=applied_roi, mode="blue")]
        elif template == "shipping_note":
            target_roi = applied_roi or {"x": 0.02, "y": 0.16, "w": 0.52, "h": 0.62}
            masks = [
                preprocess_image(image_path, roi=target_roi, mode="blue"),
                preprocess_image(image_path, roi=target_roi, mode="handwriting"),
            ]
            applied_roi = target_roi
        else:
            masks = [preprocess_image(image_path, roi=applied_roi, mode="blue")]

        best = {"raw_text": "", "confidence": 0, "text": "", "lines": [], "items": [], "suggested_roi": applied_roi}
        for mask in masks:
            result = _google_annotate_from_image(mask)
            parsed = parse_ocr_text(result.get("raw_text", ""))
            candidate = {
                "raw_text": result.get("raw_text", ""),
                "confidence": result.get("confidence", 0),
                "text": parsed["text"],
                "lines": parsed["lines"],
                "items": parsed["items"],
                "suggested_roi": applied_roi,
            }
            cand_score = (len(candidate["items"]) * 1000) + len(candidate["text"]) + candidate["confidence"]
            best_score = (len(best["items"]) * 1000) + len(best["text"]) + best["confidence"]
            if cand_score > best_score:
                best = candidate

        if not best["text"] and not roi:
            fallback = _google_annotate_from_image(preprocess_image(image_path, mode="blue"))
            parsed = parse_ocr_text(fallback.get("raw_text", ""))
            if parsed["text"]:
                best = {
                    "raw_text": fallback.get("raw_text", ""),
                    "confidence": fallback.get("confidence", 0),
                    "text": parsed["text"],
                    "lines": parsed["lines"],
                    "items": parsed["items"],
                    "suggested_roi": applied_roi,
                }
        return best
    except Exception as e:
        log_error("extract_products_by_template", e)
        return {"raw_text": "", "confidence": 0, "text": "", "lines": [], "items": [], "suggested_roi": roi or _template_default_roi(template)}

def process_ocr_text(image_path, roi=None, handwriting_mode=False):
    empty = {"success": False, "duplicate": False, "text": "", "raw_text": "", "lines": [], "items": [], "confidence": 0, "engines": [], "customer_guess": "", "template": "auto", "warning": "", "error": "", "suggested_roi": _template_default_roi("auto")}
    try:
        period = datetime_now_month()
        enabled = str(get_setting("google_ocr_enabled", "1")) == "1"
        if not GOOGLE_VISION_API_KEY:
            return {**empty, "error": "Google OCR 金鑰未設定"}
        if not enabled:
            return {**empty, "error": "Google OCR 已被停用"}
        if get_ocr_usage("google_vision", period) >= 980:
            return {**empty, "engines": ["google_vision_monthly_limit_reached"], "error": "Google OCR 本月使用量已達上限"}

        template = _detect_template(image_path)
        customer_guess = _extract_customer_by_template(image_path, template)
        products = _extract_products_by_template(image_path, template, roi=roi)
        increment_ocr_usage("google_vision", period)
        text = products.get("text", "")
        raw_text = products.get("raw_text", "")
        items = products.get("items", [])
        confidence = int(products.get("confidence", 0))
        warning = ""
        if confidence and confidence < 55:
            warning = "辨識信心偏低，建議確認自動框選範圍後再送出"
        if not text and customer_guess:
            warning = warning or "已抓到客戶名稱，但商品內容不足，請手動微調框選"
        if text and not customer_guess:
            warning = warning or "已抓到商品內容，但客戶名稱不足，請確認上方客戶區"
        return {
            "success": bool(text or raw_text or customer_guess),
            "duplicate": False,
            "raw_text": raw_text,
            "text": text,
            "lines": products.get("lines", []),
            "items": items,
            "confidence": confidence,
            "engines": ["google_vision"],
            "customer_guess": customer_guess,
            "template": template,
            "warning": warning,
            "error": "",
            "suggested_roi": products.get("suggested_roi") or _template_default_roi(template),
        }
    except Exception as e:
        log_error("process_ocr_text_google_template", e)
        return {**empty, "error": "Google OCR 執行失敗"}
