from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3, os

auth_api = Blueprint("auth_api", __name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "app.db")

def get_conn():
    return sqlite3.connect(DB_PATH)

def init_users():
    conn = get_conn()
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user'
    )
    """)
    conn.commit()
    conn.close()

init_users()

@auth_api.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    c = conn.cursor()

    c.execute("SELECT password, role FROM users WHERE username=?", (username,))
    user = c.fetchone()

    if not user:
        role = "admin" if username == "陳韋廷" else "user"
        hashed = generate_password_hash(password)
        c.execute("INSERT INTO users (username,password,role) VALUES (?,?,?)",
                  (username, hashed, role))
        conn.commit()
        conn.close()
        return jsonify({"msg":"首次登入成功","username":username,"role":role})

    stored, role = user

    if not check_password_hash(stored, password):
        conn.close()
        return jsonify({"msg":"密碼錯誤"}),400

    conn.close()
    return jsonify({"msg":"登入成功","username":username,"role":role})
