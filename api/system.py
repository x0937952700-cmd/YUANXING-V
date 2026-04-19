
from flask import Blueprint, request, jsonify
import json, os, time

system_api = Blueprint("system_api", __name__)

DB="data/db.json"

def load():
    if not os.path.exists(DB):
        return {"inventory":{}, "orders":[], "master":{}, "logs":[], "warehouse":{}}
    return json.load(open(DB))

def save(d):
    json.dump(d, open(DB,"w"))

def log(action):
    d=load()
    d["logs"].append({"action":action,"time":time.strftime("%Y-%m-%d %H:%M")})
    save(d)

@system_api.route("/api/inventory", methods=["POST"])
def inv():
    d=request.json
    db=load()
    db["inventory"][d["name"]] = db["inventory"].get(d["name"],0)+d["qty"]
    log("入庫 "+d["name"])
    save(db)
    return jsonify(success=True)

@system_api.route("/api/order", methods=["POST"])
def order():
    d=request.json
    db=load()
    d["status"]="pending"
    db["orders"].append(d)
    log("訂單 "+d["product"])
    save(db)
    return jsonify(success=True)

@system_api.route("/api/shipping", methods=["POST"])
def ship():
    d=request.json
    db=load()
    key=d["customer"]+"_"+d["product"]
    if db["master"].get(key,0)<d["qty"]:
        return jsonify(error="總單不足")
    db["master"][key]-=d["qty"]
    db["inventory"][d["product"]]-=d["qty"]
    log("出貨 "+d["product"])
    save(db)
    return jsonify(success=True)

@system_api.route("/api/logs")
def logs():
    return jsonify(items=load()["logs"])

@system_api.route("/api/warehouse", methods=["GET","POST"])
def wh():
    db=load()
    if request.method=="POST":
        db["warehouse"]=request.json
        save(db)
    return jsonify(db["warehouse"])
