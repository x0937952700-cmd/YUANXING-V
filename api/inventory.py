
from flask import Blueprint, request, jsonify
from services.db import load, save, log

inventory_api = Blueprint("inventory_api", __name__)

@inventory_api.route("/api/inventory/add", methods=["POST"])
def add():
    d=request.json
    db=load()
    db["inventory"][d["name"]] = db["inventory"].get(d["name"],0)+d["qty"]
    log(d.get("user","?"),"入庫")
    save(db)
    return jsonify(success=True)
