
from flask import Blueprint,request,jsonify
from services.db import load,save
inventory_api=Blueprint("inventory_api",__name__)

@inventory_api.route("/api/inventory/add",methods=["POST"])
def add():
    d=request.json
    db=load()
    db["inventory"][d["name"]]=db["inventory"].get(d["name"],0)+d["qty"]
    save(db)
    return jsonify(success=True)
