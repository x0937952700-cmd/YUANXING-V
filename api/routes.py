
from flask import Blueprint, request, jsonify
import json, os, time

api = Blueprint("api", __name__)
DB="data/db.json"

def load():
    if not os.path.exists(DB):
        return {"inventory":{}, "orders":[], "master":{}, "logs":[], "warehouse":{}}
    return json.load(open(DB))

def save(d):
    json.dump(d, open(DB,"w"))

def log(user,action):
    d=load()
    d["logs"].append({"user":user,"action":action,"time":time.strftime("%Y-%m-%d %H:%M")})
    save(d)

@api.route("/api/inventory/add", methods=["POST"])
def inventory_add():
    d=request.json
    db=load()
    db["inventory"][d["name"]] = db["inventory"].get(d["name"],0)+d["qty"]
    log(d.get("user","?"),"入庫 "+d["name"])
    save(db)
    return jsonify(success=True)

@api.route("/api/order", methods=["POST"])
def order():
    d=request.json
    db=load()
    d["status"]="pending"
    db["orders"].append(d)
    log(d.get("user","?"),"建立訂單 "+d["product"])
    save(db)
    return jsonify(success=True)

@api.route("/api/shipping", methods=["POST"])
def shipping():
    d=request.json
    db=load()
    key=d["customer"]+"_"+d["product"]
    if db["master"].get(key,0)<d["qty"]:
        return jsonify(error="總單不足")
    db["master"][key]-=d["qty"]
    db["inventory"][d["product"]]-=d["qty"]
    log(d.get("user","?"),"出貨 "+d["product"])
    save(db)
    return jsonify(success=True)

@api.route("/api/logs")
def logs():
    return jsonify(items=load()["logs"])

@api.route("/api/warehouse", methods=["GET","POST"])
def warehouse():
    db=load()
    if request.method=="POST":
        db["warehouse"]=request.json
        save(db)
    return jsonify(db["warehouse"])
