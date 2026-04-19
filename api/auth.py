from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3, os

auth_api = Blueprint("auth_api", __name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "app.db")

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
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

init_db()

@auth_api.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"msg": "請輸入帳號與密碼"}), 400

    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT password, role FROM users WHERE username=?", (username,))
    row = c.fetchone()

    # first-time auto register
    if not row:
        role = "admin" if username == "陳韋廷" else "user"
        hashed = generate_password_hash(password)
        try:
            c.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                      (username, hashed, role))
            conn.commit()
        finally:
            conn.close()
        return jsonify({"msg": "首次登入，已建立帳號", "username": username, "role": role})

    stored = row["password"]
    role = row["role"]
    if not check_password_hash(stored, password):
        conn.close()
        return jsonify({"msg": "密碼錯誤"}), 400

    conn.close()
    return jsonify({"msg": "登入成功", "username": username, "role": role})

@auth_api.route("/health")
def health():
    return jsonify({"ok": True})
