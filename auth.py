from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2
import os

auth_api = Blueprint("auth_api", __name__)

DATABASE_URL = os.environ.get("DATABASE_URL")


# 🔥 安全連線（沒DB也不會炸）
def get_conn():
    if not DATABASE_URL:
        return None
    return psycopg2.connect(DATABASE_URL)


# ======================
# 初始化 users 表
# ======================
def init_users():
    conn = get_conn()
    if not conn:
        print("⚠️ 沒有 DATABASE_URL，跳過 DB 初始化")
        return

    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user'
    )
    """)

    conn.commit()
    conn.close()


init_users()


# ======================
# 註冊
# ======================
@auth_api.route("/register", methods=["POST"])
def register():
    conn = get_conn()
    if not conn:
        return jsonify({"msg": "系統未連接資料庫"}), 500

    data = request.json
    username = data.get("username")
    password = data.get("password")

    c = conn.cursor()

    c.execute("SELECT id FROM users WHERE username=%s", (username,))
    if c.fetchone():
        conn.close()
        return jsonify({"msg": "帳號已存在"}), 400

    hashed_pw = generate_password_hash(password)

    role = "admin" if username == "陳韋廷" else "user"

    c.execute(
        "INSERT INTO users (username, password, role) VALUES (%s, %s, %s)",
        (username, hashed_pw, role)
    )

    conn.commit()
    conn.close()

    return jsonify({"msg": "註冊成功", "role": role})


# ======================
# 登入
# ======================
@auth_api.route("/login", methods=["POST"])
def login():
    conn = get_conn()
    if not conn:
        return jsonify({"msg": "系統未連接資料庫"}), 500

    data = request.json
    username = data.get("username")
    password = data.get("password")

    c = conn.cursor()

    c.execute("SELECT password, role FROM users WHERE username=%s", (username,))
    user = c.fetchone()

    conn.close()

    if not user:
        return jsonify({"msg": "帳號不存在"}), 400

    stored_password, role = user

    if not check_password_hash(stored_password, password):
        return jsonify({"msg": "密碼錯誤"}), 400

    return jsonify({
        "msg": "登入成功",
        "username": username,
        "role": role
    })