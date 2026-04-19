
from flask import Blueprint, request, jsonify
from services.db import load, save
import hashlib

ocr_api = Blueprint("ocr_api", __name__)

@ocr_api.route("/api/ocr", methods=["POST"])
def ocr():
    f = request.files.get("file")
    if not f:
        return jsonify(error="未上傳")

    content = f.read()
    h = hashlib.md5(content).hexdigest()

    db = load()
    if h in db["images"]:
        return jsonify(error="重複圖片")
    db["images"].append(h)

    text = "132x30x05"
    for k,v in db["ai"].items():
        text = text.replace(k,v)

    save(db)
    return jsonify(text=text, confidence=75)
