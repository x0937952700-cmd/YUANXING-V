
from flask import Flask, request, jsonify, session, redirect, render_template
import os, psycopg2, hashlib, datetime

app = Flask(__name__)
app.secret_key="final-opt"

def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))

def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

@app.route("/")
def home():
    if "u" not in session: return redirect("/login")
    return render_template("home.html")

@app.route("/login")
def login(): return render_template("login.html")

@app.route("/warehouse")
def warehouse(): return render_template("warehouse.html")

@app.route("/ai")
def ai(): return render_template("ai.html")

@app.route("/api/login",methods=["POST"])
def api_login():
    d=request.json
    u=d["username"]; p=hash_pw(d["password"])
    c=conn().cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users(u TEXT,p TEXT)")
    c.execute("SELECT * FROM users")
    if not c.fetchall():
        c.execute("INSERT INTO users VALUES(%s,%s)",(u,p))
        c.connection.commit()
    c.execute("SELECT * FROM users WHERE u=%s AND p=%s",(u,p))
    if c.fetchone():
        session["u"]=u
        return jsonify(success=True)
    return jsonify(success=False)

@app.route("/api/ai/add",methods=["POST"])
def ai_add():
    d=request.json
    c=conn().cursor()
    c.execute("CREATE TABLE IF NOT EXISTS ai_fix(wrong TEXT, correct TEXT)")
    c.execute("INSERT INTO ai_fix VALUES(%s,%s)",(d["wrong"],d["correct"]))
    c.connection.commit()
    return jsonify(success=True)

@app.route("/api/ai/list")
def ai_list():
    c=conn().cursor()
    c.execute("SELECT wrong, correct FROM ai_fix")
    rows=c.fetchall()
    return jsonify(items=[{"w":r[0],"c":r[1]} for r in rows])
