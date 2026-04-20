import os
import re
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


def preprocess_image(image_path, roi=None):
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img).convert('RGB')
    roi = _coerce_roi(roi)
    if roi:
        w0, h0 = img.size
        left = int(max(0, min(w0 - 1, roi['x'] * w0 if roi['x'] <= 1 else roi['x'])))
        top = int(max(0, min(h0 - 1, roi['y'] * h0 if roi['y'] <= 1 else roi['y'])))
        width = int(roi['w'] * w0 if roi['w'] <= 1 else roi['w'])
        height = int(roi['h'] * h0 if roi['h'] <= 1 else roi['h'])
        right = max(left + 1, min(w0, left + width))
        bottom = max(top + 1, min(h0, top + height))
        img = img.crop((left, top, right, bottom))

    # keep only blue-ish handwriting
    pixels = []
    for r, g, b in img.getdata():
        score = int(b * 1.7 - r * 0.7 - g * 0.5)
        val = 255 if score > 60 and b > r + 15 and b > g + 10 else 0
        pixels.append(val)
    mask = Image.new('L', img.size)
    mask.putdata(pixels)
    mask = ImageOps.autocontrast(mask)
    mask = mask.filter(ImageFilter.MedianFilter(3))
    mask = ImageEnhance.Contrast(mask).enhance(2.5)
    if mask.size[0] < 1400:
        mask = mask.resize((mask.size[0] * 2, mask.size[1] * 2))
    return mask


def _normalize_x(text):
    return (text or '').replace('×', 'x').replace('X', 'x').replace('*', 'x').replace('＝', '=').replace(' ', '')


def _guess_customer(raw_text):
    names = [r.get('name') for r in get_customers() if r.get('name')]
    if '東昇' in raw_text or '东昇' in raw_text or '東升' in raw_text or '东升' in raw_text:
        return '東昇'
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip() and not any(ch.isdigit() for ch in ln)]
    for line in lines:
        m = get_close_matches(line, names, n=1, cutoff=0.6)
        if m:
            return m[0]
    return ''


def _extract_item_rows(raw_text):
    rows = []
    prev_dims = None
    for raw in raw_text.splitlines():
        line = _normalize_x(raw)
        if not line or '=' not in line:
            continue
        left, right = line.split('=', 1)
        left_nums = [int(x) for x in re.findall(r'\d+', left)]
        right_nums = [int(x) for x in re.findall(r'\d+', right)]
        if not right_nums or not left_nums:
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
        rhs = right_nums[0]
        qty = right_nums[1] if len(right_nums) > 1 else 1
        line_out = f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}" + (f"x{qty}" if qty != 1 else '')
        rows.append({
            'line': line_out,
            'product_text': f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}",
            'product_code': f"{dims[0]}x{dims[1]}x{dims[2]}={rhs}",
            'qty': qty,
            'dims': dims,
        })

    rows.sort(key=lambda r: (r['dims'][2], r['dims'][1], r['dims'][0], -(r['qty'] or 1), r['line']))
    return rows


def parse_ocr_text(text):
    rows = _extract_item_rows(text or '')
    items = [{
        'raw_text': r['line'],
        'product_text': r['product_text'],
        'product_code': r['product_code'],
        'qty': r['qty'],
    } for r in rows]
    return {'text': '\n'.join(r['line'] for r in rows), 'lines': [r['line'] for r in rows], 'items': items}


def _run_google_vision(image_path, roi=None):
    if not GOOGLE_VISION_API_KEY:
        return None
    prepared = preprocess_image(image_path, roi=roi)
    import io
    buf = io.BytesIO()
    prepared.save(buf, format='PNG')
    content = base64.b64encode(buf.getvalue()).decode('utf-8')
    payload = {
        'requests': [{
            'image': {'content': content},
            'features': [{'type': 'DOCUMENT_TEXT_DETECTION'}],
            'imageContext': {'languageHints': ['zh-TW', 'en']},
        }]
    }
    resp = requests.post(f'https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}', json=payload, timeout=30)
    data = resp.json()
    response = (data.get('responses') or [{}])[0]
    annotation = response.get('fullTextAnnotation') or {}
    raw_text = annotation.get('text', '')
    confs = []
    for page in annotation.get('pages') or []:
        for block in page.get('blocks') or []:
            conf = block.get('confidence')
            if conf is not None:
                confs.append(float(conf) * 100)
    confidence = int(sum(confs) / len(confs)) if confs else 0
    parsed = parse_ocr_text(raw_text)
    return {
        'engine': 'google_vision',
        'raw_text': raw_text,
        'text': parsed['text'],
        'lines': parsed['lines'],
        'items': parsed['items'],
        'confidence': confidence,
        'customer_guess': _guess_customer(raw_text),
    }


def process_ocr_text(image_path, roi=None, handwriting_mode=False):
    try:
        period = datetime_now_month()
        enabled = str(get_setting('google_ocr_enabled', '1')) == '1'
        if not GOOGLE_VISION_API_KEY or not enabled:
            return {'success': False, 'duplicate': False, 'text': '', 'raw_text': '', 'lines': [], 'items': [], 'confidence': 0, 'engines': [], 'customer_guess': ''}
        if get_ocr_usage('google_vision', period) >= 980:
            return {'success': False, 'duplicate': False, 'text': '', 'raw_text': '', 'lines': [], 'items': [], 'confidence': 0, 'engines': ['google_vision_monthly_limit_reached'], 'customer_guess': ''}

        result = _run_google_vision(image_path, roi=roi)
        if not result:
            return {'success': False, 'duplicate': False, 'text': '', 'raw_text': '', 'lines': [], 'items': [], 'confidence': 0, 'engines': [], 'customer_guess': ''}
        increment_ocr_usage('google_vision', period)
        return {
            'success': True,
            'duplicate': False,
            'raw_text': result.get('raw_text', ''),
            'text': result.get('text', ''),
            'lines': result.get('lines', []),
            'items': result.get('items', []),
            'confidence': int(result.get('confidence', 0)),
            'engines': ['google_vision'],
            'customer_guess': result.get('customer_guess', ''),
        }
    except Exception as e:
        log_error('process_ocr_text_google_only', e)
        return {'success': False, 'duplicate': False, 'text': '', 'raw_text': '', 'lines': [], 'items': [], 'confidence': 0, 'engines': [], 'customer_guess': ''}
