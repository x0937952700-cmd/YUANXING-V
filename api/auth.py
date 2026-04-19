
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2, os

auth_api = Blueprint("auth_api", __name__)
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DATABASE_URL)

def init_users():
    conn = get_conn()
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

@auth_api.route("/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    conn = get_conn()
    c = conn.cursor()

    c.execute("SELECT id FROM users WHERE username=%s",(username,))
    if c.fetchone():
        return jsonify({"msg":"帳號已存在"}),400

    hashed = generate_password_hash(password)
    role = "admin" if username=="陳韋廷" else "user"

    c.execute("INSERT INTO users (username,password,role) VALUES (%s,%s,%s)",
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
    c.execute("SELECT password,role FROM users WHERE username=%s",(username,))
    user = c.fetchone()
    conn.close()

    if not user:
        return jsonify({"msg":"帳號不存在"}),400

    stored, role = user
    if not check_password_hash(stored,password):
        return jsonify({"msg":"密碼錯誤"}),400

    return jsonify({"msg":"登入成功","username":username,"role":role})

@auth_api.route("/reset_password")
def reset():
    conn = get_conn()
    c = conn.cursor()
    pw = generate_password_hash("123456")
    c.execute("UPDATE users SET password=%s WHERE username='陳韋廷'",(pw,))
    conn.commit()
    conn.close()
    return "reset ok"
