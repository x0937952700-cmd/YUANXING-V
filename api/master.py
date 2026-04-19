
from flask import Blueprint,request,jsonify
from services.db import load,save
master_api=Blueprint("master_api",__name__)

@master_api.route("/api/master/add",methods=["POST"])
def add():
    d=request.json
    db=load()
    k=d["customer"]+"_"+d["product"]
    db["master"][k]=db["master"].get(k,0)+d["qty"]
    save(db)
    return jsonify(success=True)
