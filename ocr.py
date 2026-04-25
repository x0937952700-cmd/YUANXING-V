import re
from difflib import get_close_matches, SequenceMatcher
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from db import (
    log_error,
    get_customers,
    get_corrections,
    get_customer_aliases_map,
)


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
        elif mode == "handwriting":
            v = (r + g + b) // 3
            val = 255 if v < 185 else 0
        else:
            v = (r + g + b) // 3
            val = 255 if v < 170 else 0
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


def _normalize_ocr_noise(text):
    text = _normalize_x(text or "")
    text = text.replace("—", "-").replace("－", "-").replace("→", "=").replace("=>", "=").replace("➜", "=").replace("~", "=")
    text = text.replace("，", ",").replace("。", ".").replace("；", ";").replace("：", ":").replace("＋", "+")
    return text


def clean_ocr_noise(text):
    text = _normalize_ocr_noise(text)
    text = re.sub(r"[\t\r]+", "\n", text)
    text = re.sub(r"[ \u3000]+", " ", text)
    text = re.sub(r" *\n+ *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.replace("｜", "1").replace("|", "1")
    text = text.replace("O", "0").replace("o", "0")
    text = text.replace("l", "1").replace("I", "1")
    # 保留括號備註，例如 168x7(-1永松)(-1威寶)，不要在清理時刪除。
    text = re.sub(r"[^0-9A-Za-z一-鿿x=+\-.,/()（）\n ]", "", text)
    return text.strip()


def _apply_corrections(text):
    try:
        corrections = get_corrections() or {}
    except Exception as e:
        log_error("get_corrections", str(e))
        corrections = {}
    result = text or ""
    if corrections:
        for wrong, right in sorted(corrections.items(), key=lambda x: len(x[0]), reverse=True):
            if wrong and right:
                result = result.replace(wrong, right)
    return result


def _extract_chinese_candidates(text):
    candidates = []
    for idx, raw in enumerate((text or "").splitlines()):
        clean = re.sub(r"[^一-鿿]", "", raw or "")
        if len(clean) >= 2:
            candidates.append({"text": clean, "line_index": idx})
    return candidates


def _customer_alias_map():
    base = {"東升": "東昇", "东升": "東昇", "东昇": "東昇", "沅兴": "沅興", "沅興木葉": "沅興木業"}
    try:
        base.update(get_customer_aliases_map() or {})
    except Exception as e:
        log_error("get_customer_aliases_map", str(e))
    return base


def _score_customer_candidate(candidate, base_name, line_index=99):
    cand = _normalize_no_space(candidate)
    base = _normalize_no_space(base_name)
    if not cand or not base:
        return 0.0
    ratio = SequenceMatcher(None, cand, base).ratio()
    bonus = 0.0
    if cand == base:
        bonus += 1.2
    elif cand in base or base in cand:
        bonus += 0.7
    if line_index == 0:
        bonus += 0.6
    elif line_index == 1:
        bonus += 0.35
    elif line_index == 2:
        bonus += 0.2
    if 2 <= len(candidate) <= 6:
        bonus += 0.15
    return ratio + bonus


def _guess_customer(raw_text, customer_hint=""):
    if customer_hint:
        return customer_hint.strip()
    names = [r.get("name") for r in get_customers() if r.get("name")]
    if not names:
        candidates = _extract_chinese_candidates(raw_text)
        return candidates[0]["text"] if candidates else ""
    alias_map = _customer_alias_map()
    normalized_text = _normalize_no_space(raw_text)
    for base in names:
        normalized_base = _normalize_no_space(base)
        if normalized_base and normalized_base in normalized_text:
            return base
    for alias, target in alias_map.items():
        if _normalize_no_space(alias) in normalized_text:
            for base in names:
                if _normalize_no_space(base) == _normalize_no_space(target):
                    return base
            return target
    best_name = ""
    best_score = 0.0
    for cand in _extract_chinese_candidates(raw_text):
        raw_candidate = alias_map.get(cand["text"], cand["text"])
        for base in names:
            score = _score_customer_candidate(raw_candidate, base, cand["line_index"])
            if score > best_score:
                best_score = score
                best_name = base
    if best_name and best_score >= 0.85:
        return best_name
    candidates = [c["text"] for c in _extract_chinese_candidates(raw_text)]
    if candidates:
        m = get_close_matches(candidates[0], names, n=1, cutoff=0.5)
        if m:
            return m[0]
        return candidates[0]
    return ""


def _extract_bbox(block):
    raw = block.get("bbox") or block.get("bounds") or block.get("frame") or block.get("boundingBox") or {}
    if isinstance(raw, dict):
        x = raw.get("x", raw.get("left", 0))
        y = raw.get("y", raw.get("top", 0))
        w = raw.get("w", raw.get("width", raw.get("right", 0)))
        h = raw.get("h", raw.get("height", raw.get("bottom", 0)))
        right = raw.get("right")
        bottom = raw.get("bottom")
        try:
            x = float(x or 0)
            y = float(y or 0)
            if right is not None and bottom is not None:
                right = float(right)
                bottom = float(bottom)
                w = max(0.0, right - x)
                h = max(0.0, bottom - y)
            else:
                w = float(w or 0)
                h = float(h or 0)
            return {"x": x, "y": y, "w": max(0.0, w), "h": max(0.0, h)}
        except Exception:
            pass
    return {"x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}


def _sort_native_blocks(blocks):
    normalized = []
    for i, block in enumerate(blocks or []):
        text = (block.get("text") or "").strip()
        if not text:
            continue
        normalized.append({
            "id": block.get("id") or f"b{i+1}",
            "text": text,
            "confidence": int(round(float(block.get("confidence") or 0))),
            "bbox": _extract_bbox(block),
        })
    normalized.sort(key=lambda b: (round(b["bbox"]["y"] / 0.03) if b["bbox"]["y"] <= 1 else b["bbox"]["y"], b["bbox"]["x"]))
    return normalized


def _group_native_blocks_to_lines(blocks):
    blocks = _sort_native_blocks(blocks)
    if not blocks:
        return []
    lines = []
    for block in blocks:
        placed = False
        by = block["bbox"]["y"]
        bh = block["bbox"]["h"] or 0.03
        tolerance = max(0.018, bh * 0.75)
        for line in lines:
            if abs(by - line["anchor_y"]) <= tolerance:
                line["blocks"].append(block)
                ys = [b["bbox"]["y"] for b in line["blocks"]]
                line["anchor_y"] = sum(ys) / max(1, len(ys))
                placed = True
                break
        if not placed:
            lines.append({"anchor_y": by, "blocks": [block]})
    result = []
    for idx, line in enumerate(lines):
        ordered = sorted(line["blocks"], key=lambda b: b["bbox"]["x"])
        line_text = " ".join(b["text"] for b in ordered).strip()
        avg_conf = int(round(sum(b["confidence"] for b in ordered) / max(1, len(ordered))))
        min_x = min(b["bbox"]["x"] for b in ordered)
        min_y = min(b["bbox"]["y"] for b in ordered)
        max_r = max(b["bbox"]["x"] + b["bbox"]["w"] for b in ordered)
        max_b = max(b["bbox"]["y"] + b["bbox"]["h"] for b in ordered)
        result.append({
            "id": f"line-{idx+1}",
            "text": line_text,
            "confidence": avg_conf,
            "bbox": {"x": min_x, "y": min_y, "w": max(0.0, max_r - min_x), "h": max(0.0, max_b - min_y)},
            "blocks": ordered,
        })
    return result


def _structured_text_from_blocks(blocks, fallback_text=""):
    lines = _group_native_blocks_to_lines(blocks)
    text = "\n".join(line["text"] for line in lines if line["text"].strip()).strip()
    return text or (fallback_text or "").strip(), lines


def _legacy_fix41_normalize_item_line(line):
    line = clean_ocr_noise(line)
    line = re.sub(r"[\[\]{}]", "", line)
    line = re.sub(r"\s+", "", line)
    line = re.sub(r"[^0-9x=+\-.,/一-鿿()（）]", "", line)
    if "=" not in line and line.count("x") >= 2 and line.count("-") == 1:
        line = line.replace("-", "=")
    if "=" not in line:
        line = re.sub(r"(?<=\d)(?=\d{1,3}x\d+$)", "=", line, count=1)
    return line


def _ensure_equals_candidate(line, prev_dims=None):
    clean = _normalize_item_line(line)
    nums = re.findall(r"\d+", clean)
    if "=" in clean:
        return clean
    if clean.count("x") >= 2 and len(nums) >= 4:
        dims = nums[:3]
        rhs = nums[3]
        qty = nums[4] if len(nums) >= 5 else None
        return f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}" + (f"x{qty}" if qty else "")
    if prev_dims and len(nums) >= 2:
        rhs = nums[0]
        qty = nums[1] if len(nums) >= 2 else None
        return f"{prev_dims[0]}x{prev_dims[1]}x{prev_dims[2]}={rhs}" + (f"x{qty}" if qty else "")
    return clean


def _legacy_fix41_extract_item_rows(raw_text):
    rows = []
    prev_dims = None
    for raw in (raw_text or "").splitlines():
        candidate = _ensure_equals_candidate(raw, prev_dims=prev_dims)
        line = re.sub(r"\s+", "", candidate)
        if not line:
            continue
        if "=" not in line and line.count("x") >= 2:
            line = _ensure_equals_candidate(line, prev_dims=prev_dims)
        if "=" not in line:
            continue
        left, right = line.split("=", 1)
        left_nums = [int(x) for x in re.findall(r"\d+", left)]
        if len(left_nums) >= 3:
            dims = left_nums[:3]
        elif len(left_nums) == 2 and prev_dims:
            dims = [left_nums[0], left_nums[1], prev_dims[2]]
        elif len(left_nums) == 1 and prev_dims:
            dims = [left_nums[0], prev_dims[1], prev_dims[2]]
        else:
            dims = prev_dims
        if not dims:
            continue
        prev_dims = dims
        segments = [seg for seg in re.split(r"[+＋,，;；]", right) if seg] or [right]
        for seg in segments:
            seg_text = (seg or "").strip()
            # 括號備註只顯示，不參與件數判斷，避免 (-1永松) 被算成件數。
            seg_for_qty = re.sub(r"[\(（][^\)）]*[\)）]", "", seg_text)
            nums = [int(x) for x in re.findall(r"\d+", seg_for_qty)]
            if not nums:
                continue
            qty = max(1, int(nums[1] if len(nums) > 1 else 1))
            line_out = f"{dims[0]}x{dims[1]}x{dims[2]}={seg_text}"
            rows.append({
                "line": line_out,
                "product_text": line_out,
                "product_code": line_out,
                "qty": qty,
                "dims": dims,
            })
    rows.sort(key=lambda r: (r["dims"][2], r["dims"][1], r["dims"][0], -(r["qty"] or 1), r["line"]))
    return rows


def _legacy_fix41_fallback_extract_lines(raw_text):
    raw_text = _normalize_x(raw_text or "")
    lines = []
    prev_dims = None
    for raw in raw_text.splitlines():
        line = _ensure_equals_candidate(raw, prev_dims=prev_dims)
        if line.count('x') >= 2 and '=' in line:
            line = re.sub(r'[^0-9x=+()（）一-鿿\\-]', '', line)
            nums = [int(x) for x in re.findall(r"\d+", line.split("=", 1)[0])]
            if len(nums) >= 3:
                prev_dims = nums[:3]
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
            seg_text = (seg or "").strip()
            seg_for_qty = re.sub(r"[\(（][^\)）]*[\)）]", "", seg_text)
            nums = [int(x) for x in re.findall(r"\d+", seg_for_qty)]
            if not nums:
                continue
            qty = max(1, nums[1] if len(nums) > 1 else 1)
            text = f"{left}={seg_text}"
            items.append({
                "raw_text": text,
                "product_text": text,
                "product_code": text,
                "qty": qty,
            })
    return items


def parse_ocr_text(text):
    cleaned = _apply_corrections(clean_ocr_noise(text or ""))
    rows = _extract_item_rows(cleaned)
    items = [{
        "raw_text": r["line"],
        "product_text": r["product_text"],
        "product_code": r["product_code"],
        "qty": r["qty"],
    } for r in rows]
    output_text = "\n".join(r["line"] for r in rows)
    if not output_text:
        fallback_lines = _fallback_extract_lines(cleaned)
        items = _build_items_from_lines(fallback_lines)
        output_text = "\n".join(i["raw_text"] for i in items)
    return {"text": output_text, "lines": output_text.splitlines() if output_text else [], "items": items, "cleaned_text": cleaned}


def process_native_ocr_text(raw_text, customer_hint="", native_confidence=0, blocks=None, ocr_mode="blue", roi=None):
    native_confidence = int(native_confidence or 0)
    ocr_mode = (ocr_mode or "blue").strip() or "blue"
    structured_text, line_map = _structured_text_from_blocks(blocks or [], fallback_text=raw_text or "")
    cleaned_text = clean_ocr_noise(structured_text or raw_text or "")
    corrected_text = _apply_corrections(cleaned_text)
    parsed = parse_ocr_text(corrected_text)
    customer_guess = _guess_customer(corrected_text or structured_text or raw_text or "", customer_hint=customer_hint)
    lines = parsed.get("lines") or [ln.strip() for ln in corrected_text.splitlines() if ln.strip()]
    parse_items = parsed.get("items") or []
    coverage_score = 0
    if corrected_text.strip():
        coverage_score += 30
    if parse_items:
        coverage_score += min(50, 18 + len(parse_items) * 12)
    if customer_guess:
        coverage_score += 15
    if line_map:
        coverage_score += 5
    parse_confidence = min(98, coverage_score)
    if native_confidence > 0 and parse_confidence > 0:
        final_confidence = int(round(native_confidence * 0.58 + parse_confidence * 0.42))
    else:
        final_confidence = max(native_confidence, parse_confidence)
    warning = ""
    if corrected_text.strip() and not parsed.get("text"):
        warning = "已收到原生辨識文字，但格式仍需人工確認；你可直接在下方文字框修改後送出"
    elif parsed.get("text") and not customer_guess:
        warning = "已抓到商品內容，但客戶名稱不足，請確認客戶欄位"
    elif final_confidence and final_confidence < 55:
        warning = "辨識已完成，但信心偏低；請直接確認文字內容後送出"
    engines = ["native_device_ocr", f"native_mode:{ocr_mode}"]
    if customer_hint:
        engines.append("customer_hint")
    if blocks:
        engines.append("position_sorted")
    if roi:
        engines.append("roi_filtered")
    if corrected_text != structured_text:
        engines.append("ocr_corrections_applied")
    return {
        "success": bool(corrected_text.strip() or parsed.get("text") or customer_guess),
        "duplicate": False,
        "raw_text": corrected_text,
        "cleaned_text": cleaned_text,
        "text": parsed.get("text", "") or corrected_text,
        "lines": lines,
        "items": parse_items,
        "confidence": final_confidence,
        "ocr_confidence": native_confidence,
        "parse_confidence": parse_confidence,
        "engines": engines,
        "customer_guess": customer_guess,
        "warning": warning,
        "error": "",
        "suggested_roi": roi,
        "line_map": [
            {
                "id": line.get("id"),
                "text": line.get("text", ""),
                "confidence": line.get("confidence", 0),
                "bbox": line.get("bbox") or {"x": 0, "y": 0, "w": 0, "h": 0},
            }
            for line in line_map
        ],
    }

# ==== FIX42 underscore previous width-height + decimal display preservation ====
def _fix42_fmt_dim_token(token, is_height=False):
    s = str(token or '').strip()
    if not s or re.fullmatch(r'[_-]+', s):
        return ''
    if re.fullmatch(r'[A-Za-z]+', s):
        return s.upper()
    if re.fullmatch(r'\d*\.\d+', s):
        if s.startswith('.'):
            s = '0' + s
        return s.replace('.', '')
    if re.fullmatch(r'\d+', s):
        return s.zfill(2) if is_height and len(s) == 1 else s
    return re.sub(r'\s+', '', s)


def _fix42_dims_from_left(left, prev_dims=None):
    prev_dims = prev_dims or ['', '', '']
    raw = _normalize_x(left or '').replace('Ｘ', 'x')
    raw = re.sub(r'\s+', '', raw)
    parts = [p for p in re.split(r'x', raw, flags=re.I) if p != '']
    if len(parts) == 2 and re.fullmatch(r'[_-]+', parts[1] or '') and prev_dims and prev_dims[1] and prev_dims[2]:
        parts = [parts[0], prev_dims[1], prev_dims[2]]
    elif len(parts) == 1 and prev_dims and prev_dims[1] and prev_dims[2]:
        parts = [parts[0], prev_dims[1], prev_dims[2]]
    elif len(parts) >= 3:
        parts = [(prev_dims[i] if re.fullmatch(r'[_-]+', parts[i] or '') and prev_dims and prev_dims[i] else parts[i]) for i in range(3)]
    if len(parts) < 3:
        return None
    dims = [_fix42_fmt_dim_token(parts[0], False), _fix42_fmt_dim_token(parts[1], False), _fix42_fmt_dim_token(parts[2], True)]
    return dims if all(dims) else None


def _fix42_sort_value(v):
    s = str(v or '')
    if re.fullmatch(r'[A-Za-z]+', s):
        return 0
    try:
        return int(re.sub(r'\D', '', s) or '0')
    except Exception:
        return 0


def _fix84_split_month_left(left):
    raw = _normalize_x(left or '')
    raw = re.sub(r'\s+', '', raw)
    m = re.match(r'^(\d{1,2})(?:月|月份)(.+)$', raw)
    if m:
        try:
            month = int(m.group(1))
            body = m.group(2) or ''
            if 1 <= month <= 12 and body:
                return month, body
        except Exception:
            pass
    return 0, raw


def _normalize_item_line(line):
    line = clean_ocr_noise(line)
    line = re.sub(r"[\[\]{}]", "", line)
    line = re.sub(r"\s+", "", line)
    line = re.sub(r"[^0-9A-Za-z_x=+\-.,/一-鿿()（）]", "", line)
    if "=" not in line and line.count("x") >= 2 and line.count("-") == 1:
        line = line.replace("-", "=")
    if "=" not in line:
        line = re.sub(r"(?<=\d)(?=\d{1,3}x\d+$)", "=", line, count=1)
    return line


def _extract_item_rows(raw_text):
    rows = []
    prev_dims = ['', '', '']
    for raw in (raw_text or '').splitlines():
        candidate = _normalize_item_line(raw)
        if not candidate:
            continue
        if '=' not in candidate and candidate.count('x') >= 2:
            candidate = _ensure_equals_candidate(candidate, prev_dims=prev_dims)
        if '=' not in candidate:
            continue
        left, right = candidate.split('=', 1)
        month, left_body = _fix84_split_month_left(left)
        dims = _fix42_dims_from_left(left_body, prev_dims=prev_dims)
        if not dims:
            continue
        prev_dims = dims[:]
        segments = [seg for seg in re.split(r"[+＋,，;；]", right) if seg] or [right]
        for seg in segments:
            seg_text = (seg or '').strip()
            seg_for_qty = re.sub(r"[\(（][^\)）]*[\)）]", "", seg_text)
            nums = [int(x) for x in re.findall(r"\d+", seg_for_qty)]
            if not nums:
                continue
            if len(nums) == 1 and re.search(r'[件片]', seg_for_qty):
                qty = max(1, nums[0])
            else:
                qty = max(1, int(nums[1] if len(nums) > 1 else 1))
            left_out = f"{dims[0]}x{dims[1]}x{dims[2]}"
            if month:
                left_out = f"{month}月{left_out}"
            line_out = f"{left_out}={seg_text}"
            rows.append({
                'line': line_out,
                'product_text': line_out,
                'product_code': line_out,
                'qty': qty,
                'dims': dims,
                'month': month,
            })
    rows.sort(key=lambda r: ((r.get('month') or 99), _fix42_sort_value(r['dims'][2]), _fix42_sort_value(r['dims'][1]), _fix42_sort_value(r['dims'][0]), -(r['qty'] or 1), r['line']))
    return rows


def _fallback_extract_lines(raw_text):
    raw_text = _normalize_x(raw_text or '')
    lines = []
    prev_dims = ['', '', '']
    for raw in raw_text.splitlines():
        line = _normalize_item_line(raw)
        if '=' not in line:
            line = _ensure_equals_candidate(line, prev_dims=prev_dims)
        if line.count('x') >= 1 and '=' in line:
            left, right = line.split('=', 1)
            month, left_body = _fix84_split_month_left(left)
            dims = _fix42_dims_from_left(left_body, prev_dims=prev_dims)
            if dims:
                prev_dims = dims[:]
                left_out = f"{dims[0]}x{dims[1]}x{dims[2]}"
                if month:
                    left_out = f"{month}月{left_out}"
                lines.append(f"{left_out}={right}")
    return lines
# ==== FIX42 end ====
