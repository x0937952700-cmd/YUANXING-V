
from flask import Blueprint, request, jsonify, session

auth_api = Blueprint("auth_api", __name__)
users={}

@auth_api.route("/api/login", methods=["POST"])
def login():
    d=request.json
    if d["username"] not in users:
        users[d["username"]]=d["password"]
    if users[d["username"]]==d["password"]:
        session["user"]=d["username"]
        return jsonify(success=True)
    return jsonify(success=False)
