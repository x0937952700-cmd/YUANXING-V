
from flask import Blueprint,request,jsonify,session
from services.db import load,save
auth_api=Blueprint("auth_api",__name__)

@auth_api.route("/api/login",methods=["POST"])
def login():
    d=request.json
    db=load()
    if d["username"] not in db["users"]:
        db["users"][d["username"]]=d["password"]
    if db["users"][d["username"]]==d["password"]:
        session["user"]=d["username"]
        save(db)
        return jsonify(success=True)
    return jsonify(success=False)
