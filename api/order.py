
from flask import Blueprint,request,jsonify
from services.db import load,save,log
order_api=Blueprint("order_api",__name__)

@order_api.route("/api/order",methods=["POST"])
def create():
    d=request.json
    db=load()
    db["orders"].append(d)
    log(d.get("user","?"),"建立訂單")
    save(db)
    return jsonify(success=True)
