from flask import Flask, request, jsonify, session, redirect, url_for, render_template
import psycopg2, os, hashlib
from datetime import timedelta

app = Flask(__name__)
app.secret_key = "yuanxing-secret-key"
app.permanent_session_lifetime = timedelta(days=3650)

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        name TEXT,
        qty INTEGER
    )
    """)

    conn.commit()
    conn.close()

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def require_login():
    return "user" in session

@app.route("/")
def home():
    if not require_login():
        return redirect(url_for("login_page"))
    return render_template("home.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    c = conn.cursor()

    c.execute("SELECT * FROM users")
    users = c.fetchall()

    if len(users) == 0:
        c.execute(
            "INSERT INTO users (username, password) VALUES (%s, %s)",
            (username, hash_pw(password))
        )
        conn.commit()

    c.execute(
        "SELECT * FROM users WHERE username=%s AND password=%s",
        (username, hash_pw(password))
    )
    user = c.fetchone()
    conn.close()

    if user:
        session["user"] = username
        session.permanent = True
        return jsonify(success=True)

    return jsonify(success=False, error="帳密錯誤")

@app.route("/api/logout")
def logout():
    session.clear()
    return redirect("/login")

@app.route("/api/inventory", methods=["GET"])
def get_inventory():
    if not require_login():
        return jsonify(success=False), 401

    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM inventory")
    rows = c.fetchall()
    conn.close()

    items = [
        {"id": r[0], "name": r[1], "qty": r[2]}
        for r in rows
    ]

    return jsonify(success=True, items=items)

@app.route("/api/inventory/add", methods=["POST"])
def add_inventory():
    if not require_login():
        return jsonify(success=False), 401

    data = request.json
    name = data.get("name")
    qty = int(data.get("qty", 0))

    if qty <= 0:
        return jsonify(success=False, error="數量錯誤")

    conn = get_conn()
    c = conn.cursor()

    c.execute(
        "INSERT INTO inventory (name, qty) VALUES (%s, %s)",
        (name, qty)
    )

    conn.commit()
    conn.close()

    return jsonify(success=True)

init_db()
