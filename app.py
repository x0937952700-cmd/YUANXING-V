
from flask import Flask, request, jsonify, session, redirect, url_for, render_template
import psycopg2, os, hashlib, datetime

app = Flask(__name__)
app.secret_key = "yuanxing-final"

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_conn():
    return psycopg2.connect(DATABASE_URL)

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def require_login():
    return "user" in session

def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.execute("CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS inventory (name TEXT, qty INT)")
    c.execute("CREATE TABLE IF NOT EXISTS orders (customer TEXT, product TEXT, qty INT, time TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS logs (user_name TEXT, action TEXT, time TEXT)")

    conn.commit()
    conn.close()

init_db()

@app.route("/")
def home():
    if not require_login():
        return redirect("/login")
    return render_template("home.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    u = data["username"]
    p = hash_pw(data["password"])

    conn = get_conn()
    c = conn.cursor()

    c.execute("SELECT * FROM users")
    if not c.fetchall():
        c.execute("INSERT INTO users VALUES (%s,%s)", (u,p))
        conn.commit()

    c.execute("SELECT * FROM users WHERE username=%s AND password=%s",(u,p))
    user = c.fetchone()
    conn.close()

    if user:
        session["user"] = u
        return jsonify(success=True)

    return jsonify(success=False)

@app.route("/api/add_order", methods=["POST"])
def add_order():
    if not require_login():
        return jsonify(success=False)

    d = request.json
    customer = d["customer"]
    product = d["product"]
    qty = int(d["qty"])

    conn = get_conn()
    c = conn.cursor()

    # 扣庫存
    c.execute("SELECT qty FROM inventory WHERE name=%s",(product,))
    row = c.fetchone()

    if not row or row[0] < qty:
        conn.close()
        return jsonify(success=False, error="庫存不足")

    c.execute("UPDATE inventory SET qty=qty-%s WHERE name=%s",(qty,product))

    # 建立訂單
    c.execute("INSERT INTO orders VALUES (%s,%s,%s,%s)",
        (customer,product,qty,str(datetime.datetime.now())))

    # 紀錄
    c.execute("INSERT INTO logs VALUES (%s,%s,%s)",
        (session["user"],"建立訂單",str(datetime.datetime.now())))

    conn.commit()
    conn.close()

    return jsonify(success=True)

@app.route("/api/inventory", methods=["GET"])
def inv():
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM inventory")
    data = c.fetchall()
    conn.close()
    return jsonify(data=data)

@app.route("/api/add_inventory", methods=["POST"])
def add_inv():
    d = request.json
    conn = get_conn()
    c = conn.cursor()

    c.execute("SELECT qty FROM inventory WHERE name=%s",(d["name"],))
    row = c.fetchone()

    if row:
        c.execute("UPDATE inventory SET qty=qty+%s WHERE name=%s",(d["qty"],d["name"]))
    else:
        c.execute("INSERT INTO inventory VALUES (%s,%s)",(d["name"],d["qty"]))

    conn.commit()
    conn.close()
    return jsonify(success=True)
