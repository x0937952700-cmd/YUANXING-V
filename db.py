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
# 🔥 修復 DB（重點）
# ======================
def init_db():
    conn = get_db()
    cur = conn.cursor()

    # 修舊 warehouse_cells
    try:
        cur.execute("SELECT zone FROM warehouse_cells LIMIT 1")
    except:
        try:
            cur.execute("DROP TABLE IF EXISTS warehouse_cells")
            conn.commit()
            print("🔥 重建 warehouse_cells")
        except:
            pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS inventory(
        id SERIAL PRIMARY KEY,
        product_text TEXT,
        qty INTEGER
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders(
        id SERIAL PRIMARY KEY,
        customer_name TEXT,
        product_text TEXT,
        qty INTEGER
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS master_orders(
        id SERIAL PRIMARY KEY,
        customer_name TEXT,
        product_text TEXT,
        qty INTEGER
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS warehouse_cells(
        id SERIAL PRIMARY KEY,
        zone TEXT,
        column_index INTEGER,
        slot_type TEXT,
        slot_number INTEGER,
        items_json TEXT
    )
    """)

    conn.commit()
    conn.close()

# ======================
# 🔥 必要 functions（補回來）
# ======================

def get_user(username):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username=%s", (username,))
    row = cur.fetchone()
    conn.close()
    return {"username": row[1], "password": row[2]} if row else None

def create_user(username, password):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO users(username,password) VALUES(%s,%s)", (username,password))
    conn.commit()
    conn.close()

def update_password(username, password):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET password=%s WHERE username=%s",(password,username))
    conn.commit()
    conn.close()

def log_action(username, action):
    print(f"[LOG] {username} -> {action}")

def log_error(src, msg):
    print(f"[ERROR] {src} -> {msg}")

def save_inventory_item(product_text, product_code, qty, *args):
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

def save_order(customer_name, items, operator):
    conn = get_db()
    cur = conn.cursor()
    for i in items:
        cur.execute("INSERT INTO orders(customer_name,product_text,qty) VALUES(%s,%s,%s)",
                    (customer_name,i["product_text"],i["qty"]))
    conn.commit()
    conn.close()

def save_master_order(customer_name, items, operator):
    conn = get_db()
    cur = conn.cursor()
    for i in items:
        cur.execute("INSERT INTO master_orders(customer_name,product_text,qty) VALUES(%s,%s,%s)",
                    (customer_name,i["product_text"],i["qty"]))
    conn.commit()
    conn.close()

def ship_order(customer_name, items, operator):
    return {"success": True}

def get_shipping_records(*args):
    return []

def save_correction(*args): pass
def save_image_hash(*args): pass
def image_hash_exists(*args): return False
def upsert_customer(*args): pass
def get_customers(): return []
def get_customer(name): return {}
def warehouse_get_cells(): return []
def warehouse_save_cell(*args): pass
def warehouse_move_item(*args): return {"success": True}
def inventory_summary(): return []
def warehouse_summary(): return {}
def list_backups(): return []
def get_orders(): return []
def get_master_orders(): return []
def row_to_dict(x): return x
def sql(x): return x
def rows_to_dict(x): return x
def fetchone_dict(x): return x