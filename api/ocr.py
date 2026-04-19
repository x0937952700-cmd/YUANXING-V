
from flask import Blueprint, request, jsonify
from services.db import load, save
import hashlib

ocr_api=Blueprint("ocr_api",__name__)

def fake_ocr(txt):
    return txt

@ocr_api.route("/api/ocr",methods=["POST"])
def ocr():
    f=request.files.get("file")
    if not f:
        return jsonify(error="未上傳")
    content=f.read()
    h=hashlib.md5(content).hexdigest()

    d=load()
    if "last_hash" in d and d["last_hash"]==h:
        return jsonify(error="重複圖片")
    d["last_hash"]=h

    text="132x30x05"
    for k,v in d["ai"].items():
        text=text.replace(k,v)

    save(d)
    return jsonify(text=text,confidence=75)
