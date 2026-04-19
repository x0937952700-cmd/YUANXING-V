
from flask import Blueprint,request,jsonify
core_api=Blueprint("core_api",__name__)

data={"inventory":{},"logs":[],"warehouse":{}}

@core_api.route("/api/add",methods=["POST"])
def add():
    d=request.json
    data["inventory"][d["name"]]=data["inventory"].get(d["name"],0)+1
    data["logs"].append(d)
    return jsonify(success=True)

@core_api.route("/api/logs")
def logs():
    return jsonify(items=data["logs"])

@core_api.route("/api/warehouse",methods=["POST","GET"])
def wh():
    if request.method=="POST":
        data["warehouse"]=request.json
    return jsonify(data["warehouse"])
