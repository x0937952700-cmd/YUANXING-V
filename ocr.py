import os
import re
import base64
from difflib import get_close_matches

import requests
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from db import log_error, get_corrections, list_inventory

try:
    import pytesseract
except Exception:
    pytesseract = None

NOISE_WORDS = [
    "全部筆記", "昨天", "今天", "備忘錄", "新增", "完成", "搜尋",
    "筆記", "ocr", "key", "掃描文件", "編輯", "返回", "分享"
]

OCR_SPACE_API_KEY = os.getenv("OCR_SPACE_API_KEY", "helloworld")
GOOGLE_VISION_API_KEY = os.getenv("GOOGLE_VISION_API_KEY") or os.getenv("GOOGLE_API_KEY")


def preprocess_image(image_path):
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("L")
    width, height = img.size
    if width < 1200:
        img = img.resize((width * 2, height * 2))
    img = img.filter(ImageFilter.MedianFilter())
    img = ImageEnhance.Contrast(img).enhance(2.2)
    img = ImageEnhance.Sharpness(img).enhance(1.8)
    return img


def normalize_text(text):
    text = (text or "").strip()
    replace_map = {
        " ": "",
        "×": "x",
        "X": "x",
        "：": ":",
        "O": "0",
        "o": "0",
        "I": "1",
        "l": "1",
        "|": "1",
        "（": "(",
        "）": ")",
        "＊": "*",
        "﹡": "*",
    }
    for old, new in replace_map.items():
        text = text.replace(old, new)
    return text


def is_noise_line(text):
    low = text.lower()
    if not text.strip():
        return True
    for noise in NOISE_WORDS:
        if noise.lower() in low:
            return True
    if re.match(r"^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$", text):
        return True
    if re.match(r"^\d{1,2}:\d{2}$", text):
        return True
    if re.match(r"^\d{1,3}$", text):
        return True
    return False


def get_known_products():
    rows = list_inventory()
    return [r["product_text"] for r in rows if r.get("product_text")]


def apply_ai_correction(product_name):
    product_name = normalize_text(product_name)
    corrections = get_corrections()
    if product_name in corrections:
        return corrections[product_name]
    known_products = get_known_products()
    if known_products:
        matches = get_close_matches(product_name, known_products, n=1, cutoff=0.72)
        if matches:
            return matches[0]
    return product_name


def parse_line(line):
    line = normalize_text(line)
    patterns = [
        r"(.+?)[=:](\d+)$",
        r"(.+?)[x](\d+)$",
        r"(.+?)\*(\d+)$",
        r"(.+?)\s+(\d+)$",
    ]
    for p in patterns:
        m = re.match(p, line)
        if m:
            return m.group(1).strip(), int(m.group(2))
    return line, 1


def parse_ocr_text(text):
    lines = []
    items = []
    for raw in (text or "").splitlines():
        raw = raw.strip()
        if not raw or is_noise_line(raw):
            continue
        product_raw, qty = parse_line(raw)
        if is_noise_line(product_raw):
            continue
        product_fixed = apply_ai_correction(product_raw)
        items.append({
            "raw_text": product_raw,
            "product_text": product_fixed,
            "product_code": product_fixed.split("=")[0],
            "qty": qty,
        })
        lines.append(f"{product_fixed}={qty}")
    return {"text": "\n".join(lines), "lines": lines, "items": items}


def _score(parsed, confidence, engine):
    bonus = {"google_vision": 25, "ocr_space": 15, "tesseract": 5}.get(engine, 0)
    return len(parsed.get("items", [])) * 100 + len(parsed.get("text", "")) + int(confidence or 0) + bonus


def _run_tesseract(image_path):
    if pytesseract is None:
        return None
    try:
        img = preprocess_image(image_path)
        raw_data = pytesseract.image_to_data(
            img,
            lang="chi_tra+eng",
            config="--psm 6",
            output_type=pytesseract.Output.DICT,
        )
        confidence_values = []
        for conf in raw_data.get("conf", []):
            try:
                val = float(conf)
                if val > 0:
                    confidence_values.append(val)
            except Exception:
                pass
        avg_confidence = int(sum(confidence_values) / len(confidence_values)) if confidence_values else 0
        text = pytesseract.image_to_string(img, lang="chi_tra+eng", config="--psm 6")
        parsed = parse_ocr_text(text)
        return {
            "engine": "tesseract",
            "text": parsed["text"],
            "lines": parsed["lines"],
            "items": parsed["items"],
            "confidence": avg_confidence,
            "score": _score(parsed, avg_confidence, "tesseract"),
        }
    except Exception as e:
        log_error("ocr_tesseract", e)
        return None


def _run_ocr_space(image_path):
    try:
        with open(image_path, "rb") as f:
            payload = {
                "apikey": OCR_SPACE_API_KEY,
                "language": "cht",
                "OCREngine": 2,
                "scale": True,
                "isTable": False,
                "detectOrientation": True,
            }
            resp = requests.post(
                "https://api.ocr.space/parse/image",
                files={"filename": f},
                data=payload,
                timeout=30,
            )
        data = resp.json()
        parsed_results = data.get("ParsedResults") or []
        text = "\n".join((r.get("ParsedText") or "") for r in parsed_results).strip()
        confs = []
        for pr in parsed_results:
            overlay = pr.get("TextOverlay") or {}
            for line in overlay.get("Lines") or []:
                for word in line.get("Words") or []:
                    conf = word.get("Confidence")
                    if conf is not None:
                        try:
                            confs.append(float(conf))
                        except Exception:
                            pass
        confidence = int(sum(confs) / len(confs)) if confs else 0
        parsed = parse_ocr_text(text)
        return {
            "engine": "ocr_space",
            "text": parsed["text"],
            "lines": parsed["lines"],
            "items": parsed["items"],
            "confidence": confidence,
            "score": _score(parsed, confidence, "ocr_space"),
        }
    except Exception as e:
        log_error("ocr_space", e)
        return None


def _run_google_vision(image_path):
    if not GOOGLE_VISION_API_KEY:
        return None
    try:
        with open(image_path, "rb") as f:
            content = base64.b64encode(f.read()).decode("utf-8")
        payload = {
            "requests": [{
                "image": {"content": content},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["zh-TW", "en"]},
            }]
        }
        resp = requests.post(
            f"https://vision.googleapis.com/v1/images:annotate?key={GOOGLE_VISION_API_KEY}",
            json=payload,
            timeout=30,
        )
        data = resp.json()
        response = (data.get("responses") or [{}])[0]
        annotation = response.get("fullTextAnnotation") or {}
        text = annotation.get("text", "")
        confs = []
        for page in annotation.get("pages") or []:
            for block in page.get("blocks") or []:
                conf = block.get("confidence")
                if conf is not None:
                    confs.append(float(conf) * 100)
        confidence = int(sum(confs) / len(confs)) if confs else 0
        parsed = parse_ocr_text(text)
        return {
            "engine": "google_vision",
            "text": parsed["text"],
            "lines": parsed["lines"],
            "items": parsed["items"],
            "confidence": confidence,
            "score": _score(parsed, confidence, "google_vision"),
        }
    except Exception as e:
        log_error("google_vision", e)
        return None


def process_ocr_text(image_path):
    try:
        candidates = [
            result for result in (
                _run_google_vision(image_path),
                _run_ocr_space(image_path),
                _run_tesseract(image_path),
            ) if result
        ]
        if not candidates:
            return {
                "success": False,
                "duplicate": False,
                "text": "",
                "lines": [],
                "items": [],
                "confidence": 0,
                "engines": [],
            }
        best = sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)[0]
        return {
            "success": True,
            "duplicate": False,
            "text": best.get("text", ""),
            "lines": best.get("lines", []),
            "items": best.get("items", []),
            "confidence": int(best.get("confidence", 0)),
            "engines": [c.get("engine") for c in candidates],
        }
    except Exception as e:
        log_error("process_ocr_text", e)
        return {
            "success": False,
            "duplicate": False,
            "text": "",
            "lines": [],
            "items": [],
            "confidence": 0,
            "engines": [],
        }
