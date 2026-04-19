from flask import Blueprint, request, jsonify, session
import hashlib
from services.db import conn

auth_api = Blueprint("auth_api", __name__)

def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

@auth_api.route("/api/login", methods=["POST"])
def login():
    d=request.json
    u=d["username"]
    p=hash_pw(d["password"])
    db=conn();c=db.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,password TEXT)")
    c.execute("SELECT password FROM users WHERE username=%s",(u,))
    r=c.fetchone()
    if not r:
        c.execute("INSERT INTO users VALUES(%s,%s)",(u,p))
        db.commit()
        session["user"]=u
        return jsonify(success=True)
    if r[0]==p:
        session["user"]=u
        return jsonify(success=True)
    return jsonify(success=False)
