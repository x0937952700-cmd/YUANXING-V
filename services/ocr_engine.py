import requests, os
from google.cloud import vision

def google_ocr(file_bytes):
    try:
        client = vision.ImageAnnotatorClient()
        image = vision.Image(content=file_bytes)
        res = client.text_detection(image=image)
        if res.text_annotations:
            return res.text_annotations[0].description, 95
    except:
        return None, 0
    return None, 0

def ocr_space(file_bytes):
    try:
        r = requests.post(
            "https://api.ocr.space/parse/image",
            files={"file": ("img.jpg", file_bytes)},
            data={"apikey": os.getenv("OCR_SPACE_API_KEY","helloworld")}
        )
        text = r.json()["ParsedResults"][0]["ParsedText"]
        return text, 80
    except:
        return None, 0

def run_ocr(file_bytes):
    text, conf = google_ocr(file_bytes)
    if text: return text, conf

    text, conf = ocr_space(file_bytes)
    if text: return text, conf

    return "OCR失敗", 0
