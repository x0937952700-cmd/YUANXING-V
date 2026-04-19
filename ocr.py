
import cv2, pytesseract, requests, os
from google.cloud import vision
from datetime import datetime

def preprocess(img_path):
    img = cv2.imread(img_path)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_blue = (90,50,50)
    upper_blue = (140,255,255)
    mask = cv2.inRange(hsv, lower_blue, upper_blue)
    res = cv2.bitwise_and(img,img,mask=mask)
    gray = cv2.cvtColor(res, cv2.COLOR_BGR2GRAY)
    return gray

def ocr_tesseract(path):
    img = preprocess(path)
    text = pytesseract.image_to_string(img)
    return text, 65

def ocr_ocrspace(path):
    url = 'https://api.ocr.space/parse/image'
    payload = {'apikey': os.environ.get("OCR_SPACE_API_KEY")}
    with open(path,'rb') as f:
        r = requests.post(url, files={'file':f}, data=payload)
    try:
        text = r.json()['ParsedResults'][0]['ParsedText']
        return text, 75
    except:
        return "",0

def ocr_google(path):
    client = vision.ImageAnnotatorClient()
    with open(path,'rb') as f:
        content=f.read()
    image=vision.Image(content=content)
    res = client.text_detection(image=image)
    if res.text_annotations:
        return res.text_annotations[0].description, 95
    return "",0

def get_month():
    return datetime.now().strftime("%Y-%m")

def get_google_count(conn):
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS ocr_usage(month TEXT PRIMARY KEY, google_count INT)")
    m = get_month()
    c.execute("SELECT google_count FROM ocr_usage WHERE month=%s",(m,))
    r = c.fetchone()
    if not r:
        c.execute("INSERT INTO ocr_usage VALUES(%s,0)",(m,))
        conn.commit()
        return 0
    return r[0]

def add_google_count(conn):
    c = conn.cursor()
    m = get_month()
    c.execute("UPDATE ocr_usage SET google_count=google_count+1 WHERE month=%s",(m,))
    conn.commit()

def can_use_google(conn):
    return get_google_count(conn) < 980

def apply_ai_fix(text, conn):
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS ai_fix(wrong TEXT, correct TEXT)")
    c.execute("SELECT wrong, correct FROM ai_fix")
    for w,corr in c.fetchall():
        text = text.replace(w, corr)
    return text

def is_valid(text):
    return "x" in text and "=" in text

def run_ocr(path, conn):
    text, conf = ocr_tesseract(path)

    if conf < 70 or not is_valid(text):
        t2,c2 = ocr_ocrspace(path)
        if c2 > conf:
            text, conf = t2, c2

    if (conf < 80 or not is_valid(text)) and can_use_google(conn):
        t3,c3 = ocr_google(path)
        if c3 > conf:
            text, conf = t3, c3
        add_google_count(conn)

    text = apply_ai_fix(text, conn)
    return text, conf
