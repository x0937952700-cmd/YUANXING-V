from flask import Blueprint, request, jsonify
from services.ocr_engine import run_ocr

ocr_api = Blueprint("ocr_api", __name__)

@ocr_api.route("/api/ocr", methods=["POST"])
def ocr():
    file = request.files["file"]
    data = file.read()

    text, conf = run_ocr(data)
    return jsonify(text=text, confidence=conf)
