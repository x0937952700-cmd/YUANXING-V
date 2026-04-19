
from flask import Blueprint,request,jsonify
from services.db import load,save,log
shipping_api=Blueprint("shipping_api",__name__)

@shipping_api.route("/api/shipping",methods=["POST"])
def ship():
    d=request.json
    db=load()
    k=d["customer"]+"_"+d["product"]
    if db["master"].get(k,0)<d["qty"]:
        return jsonify(error="總單不足")
    db["master"][k]-=d["qty"]
    db["inventory"][d["product"]]-=d["qty"]
    log(d.get("user","?"),"出貨")
    save(db)
    return jsonify(success=True)
