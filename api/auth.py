from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import os, sqlite3

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

@auth_api.route("/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"msg":"請輸入帳號密碼"}),400

    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE username=?",(username,))
    if c.fetchone():
        conn.close()
        return jsonify({"msg":"帳號已存在"}),400

    role = "admin" if username=="陳韋廷" else "user"
    hashed = generate_password_hash(password)
    c.execute("INSERT INTO users (username,password,role) VALUES (?,?,?)",
              (username,hashed,role))
    conn.commit()
    conn.close()
    return jsonify({"msg":"註冊成功","role":role})

@auth_api.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT password,role FROM users WHERE username=?",(username,))
    user = c.fetchone()
    conn.close()

    if not user:
        return jsonify({"msg":"帳號不存在"}),400

    stored,role = user
    if not check_password_hash(stored,password):
        return jsonify({"msg":"密碼錯誤"}),400

    return jsonify({"msg":"登入成功","username":username,"role":role})

@auth_api.route("/reset_password")
def reset():
    conn = get_conn()
    c = conn.cursor()
    new = generate_password_hash("123456")
    c.execute("UPDATE users SET password=? WHERE username='陳韋廷'",(new,))
    conn.commit()
    conn.close()
    return "ok"
