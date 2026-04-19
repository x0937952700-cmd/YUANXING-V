
from flask import Flask, request, jsonify, session, redirect, render_template
import os, psycopg2, hashlib

app = Flask(__name__)
app.secret_key = "final-auth"

def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))

def hash_pw(p):
    return hashlib.sha256(p.encode()).hexdigest()

def init_db():
    db = conn()
    c = db.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    db.commit()

init_db()

@app.route("/")
def home():
    if "user" not in session:
        return redirect("/login")
    return render_template("home.html", user=session["user"])

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json
    username = data.get("username")
    password = hash_pw(data.get("password"))

    db = conn()
    c = db.cursor()

    # 查帳號
    c.execute("SELECT password FROM users WHERE username=%s", (username,))
    user = c.fetchone()

    # 不存在 → 註冊
    if not user:
        c.execute("INSERT INTO users(username, password) VALUES(%s,%s)", (username, password))
        db.commit()
        session["user"] = username
        return jsonify(success=True, mode="register")

    # 存在 → 登入
    if user[0] == password:
        session["user"] = username
        return jsonify(success=True, mode="login")

    return jsonify(success=False)

