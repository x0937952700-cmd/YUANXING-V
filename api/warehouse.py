
from flask import Blueprint,request,jsonify
from services.db import load,save
warehouse_api=Blueprint("warehouse_api",__name__)

@warehouse_api.route("/api/warehouse/save",methods=["POST"])
def save_wh():
    d=request.json
    db=load()
    db["warehouse"]=d
    save(db)
    return jsonify(success=True)

@warehouse_api.route("/api/warehouse/load")
def load_wh():
    return jsonify(load()["warehouse"])
