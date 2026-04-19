import os
import sqlite3
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "")
USE_POSTGRES = DATABASE_URL.startswith("postgres")

if USE_POSTGRES:
    import psycopg2

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def get_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return conn
    return sqlite3.connect("local.db")

# ======================
# INIT DB（完整）
# ======================
def init_db():
    conn = get_db()
    cur = conn.cursor()

    tables = [

    """CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
    )""",

    """CREATE TABLE IF NOT EXISTS inventory(
        id SERIAL PRIMARY KEY,
        product_text TEXT,
        qty INTEGER
    )""",

    """CREATE TABLE IF NOT EXISTS orders(
        id SERIAL PRIMARY KEY,
        customer_name TEXT,
        product_text TEXT,
        qty INTEGER
    )""",

    """CREATE TABLE IF NOT EXISTS master_orders(
        id SERIAL PRIMARY KEY,
        customer_name TEXT,
        product_text TEXT,
        qty INTEGER
    )""",

    """CREATE TABLE IF NOT EXISTS corrections(
        id SERIAL PRIMARY KEY,
        wrong TEXT,
        correct TEXT
    )""",

    """CREATE TABLE IF NOT EXISTS image_hashes(
        id SERIAL PRIMARY KEY,
        hash TEXT
    )""",

    """CREATE TABLE IF NOT EXISTS warehouse_cells(
        id SERIAL PRIMARY KEY,
        zone TEXT,
        column_index INTEGER,
        slot_type TEXT,
        slot_number INTEGER,
        items_json TEXT
    )"""
    ]

    for t in tables:
        cur.execute(t)

    conn.commit()
    conn.close()

# ======================
# USER
# ======================
def get_user(username):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username=%s",(username,))
    r = cur.fetchone()
    conn.close()
    return {"username":r[1],"password":r[2]} if r else None

def create_user(username,password):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO users(username,password) VALUES(%s,%s)",(username,password))
    conn.commit()
    conn.close()

def update_password(username,password):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET password=%s WHERE username=%s",(password,username))
    conn.commit()
    conn.close()

# ======================
# OCR 修正（🔥補這個）
# ======================
def get_corrections():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT wrong,correct FROM corrections")
    rows = cur.fetchall()
    conn.close()
    return {r[0]:r[1] for r in rows}

def save_correction(wrong,correct):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO corrections(wrong,correct) VALUES(%s,%s)",(wrong,correct))
    conn.commit()
    conn.close()

# ======================
# HASH（避免重複）
# ======================
def save_image_hash(h):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO image_hashes(hash) VALUES(%s)",(h,))
    conn.commit()
    conn.close()

def image_hash_exists(h):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM image_hashes WHERE hash=%s",(h,))
    r = cur.fetchone()
    conn.close()
    return bool(r)

# ======================
# INVENTORY
# ======================
def save_inventory_item(product_text,product_code,qty,*args):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO inventory(product_text,qty) VALUES(%s,%s)",(product_text,qty))
    conn.commit()
    conn.close()

def list_inventory():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM inventory")
    rows = cur.fetchall()
    conn.close()
    return [{"product_text":r[1],"qty":r[2]} for r in rows]

# ======================
# LOG
# ======================
def log_action(user,action):
    print(f"[LOG] {user} -> {action}")

def log_error(src,msg):
    print(f"[ERROR] {src} -> {msg}")

# ======================
# 其他（先讓系統活）
# ======================
def save_order(*a,**k): pass
def save_master_order(*a,**k): pass
def ship_order(*a,**k): return {"success":True}
def get_shipping_records(*a,**k): return []
def upsert_customer(*a,**k): pass
def get_customers(): return []
def get_customer(x): return {}
def warehouse_get_cells(): return []
def warehouse_save_cell(*a,**k): pass
def warehouse_move_item(*a,**k): return {"success":True}
def inventory_summary(): return []
def warehouse_summary(): return {}
def list_backups(): return []
def get_orders(): return []
def get_master_orders(): return []
def row_to_dict(x): return x
def sql(x): return x
def rows_to_dict(x): return x
def fetchone_dict(x): return x
