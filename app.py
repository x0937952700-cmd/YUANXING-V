
from flask import Flask, request, jsonify, session, redirect, render_template
import os, psycopg2, hashlib

app = Flask(__name__)
app.secret_key = "fixed-login"

def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))

def hash_pw(p):
    return hashlib.sha256(p.encode()).hexdigest()

def init_db():
    db = conn()
    c = db.cursor()
    # 🔥 清空舊帳號（你要求）
    c.execute("DROP TABLE IF EXISTS users")
    c.execute("CREATE TABLE users(username TEXT PRIMARY KEY, password TEXT)")
    db.commit()

init_db()

@app.route("/")
def home():
    if "user" not in session:
        return redirect("/login")
    return render_template("home.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    username = data.get("username")
    password = hash_pw(data.get("password"))

    db = conn()
    c = db.cursor()

    c.execute("SELECT * FROM users WHERE username=%s", (username,))
    user = c.fetchone()

    # 第一次註冊
    if not user:
        c.execute("INSERT INTO users VALUES(%s,%s)", (username, password))
        db.commit()
        session["user"] = username
        return jsonify(success=True)

    # 登入
    if user[1] == password:
        session["user"] = username
        return jsonify(success=True)

    return jsonify(success=False)
