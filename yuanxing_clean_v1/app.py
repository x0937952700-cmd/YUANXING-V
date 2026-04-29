import os, re, json, uuid, shutil, sqlite3
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import Flask, request, session, redirect, url_for, render_template, jsonify, send_file, abort
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "warehouse.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
IS_PG = DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "yuanxing-clean-v1-change-me")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# -----------------------------
# DB helper
# -----------------------------

def _pg_conn():
    import psycopg2
    import psycopg2.extras
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def get_conn():
    if IS_PG:
        return _pg_conn()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def sql(q: str) -> str:
    return q.replace("?", "%s") if IS_PG else q

def rows_to_dict(rows):
    if not rows:
        return []
    return [dict(r) for r in rows]

def one_to_dict(row):
    return dict(row) if row else None

def execute(q, params=(), *, fetchone=False, fetchall=False, commit=True):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql(q), params)
        data = None
        if fetchone:
            data = one_to_dict(cur.fetchone())
        elif fetchall:
            data = rows_to_dict(cur.fetchall())
        if commit:
            conn.commit()
        return data
    finally:
        conn.close()

def executemany(q, seq):
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.executemany(sql(q), seq)
        conn.commit()
    finally:
        conn.close()

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init_db():
    if IS_PG:
        serial = "SERIAL PRIMARY KEY"
        text_pk = "TEXT PRIMARY KEY"
        bool_default = "INTEGER DEFAULT 0"
    else:
        serial = "INTEGER PRIMARY KEY AUTOINCREMENT"
        text_pk = "TEXT PRIMARY KEY"
        bool_default = "INTEGER DEFAULT 0"

    stmts = [
        f"""CREATE TABLE IF NOT EXISTS users (
            id {serial},
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            is_blocked INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS customers (
            id {serial},
            name TEXT UNIQUE NOT NULL,
            region TEXT DEFAULT 'north',
            archived INTEGER DEFAULT 0,
            common_materials TEXT DEFAULT '',
            common_sizes TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS inventory (
            id {serial},
            material TEXT DEFAULT '',
            size_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces_count INTEGER DEFAULT 0,
            warehouse_cell TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS orders (
            id {serial},
            customer_name TEXT NOT NULL,
            material TEXT DEFAULT '',
            size_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'open',
            warehouse_cell TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS master_orders (
            id {serial},
            customer_name TEXT NOT NULL,
            material TEXT DEFAULT '',
            size_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces_count INTEGER DEFAULT 0,
            warehouse_cell TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS shipping_records (
            id {serial},
            customer_name TEXT DEFAULT '',
            source_type TEXT DEFAULT '',
            source_id INTEGER DEFAULT 0,
            material TEXT DEFAULT '',
            size_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces_count INTEGER DEFAULT 0,
            volume REAL DEFAULT 0,
            weight_input REAL DEFAULT 0,
            total_weight REAL DEFAULT 0,
            deduction_source TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            shipped_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {serial},
            zone TEXT NOT NULL,
            section_no INTEGER NOT NULL,
            row_name TEXT NOT NULL,
            cell_no INTEGER NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS warehouse_items (
            id {serial},
            cell_key TEXT NOT NULL,
            source_type TEXT DEFAULT '',
            source_id INTEGER DEFAULT 0,
            customer_name TEXT DEFAULT '',
            material TEXT DEFAULT '',
            size_text TEXT DEFAULT '',
            qty_expr TEXT DEFAULT '',
            pieces_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS activity_logs (
            id {serial},
            kind TEXT DEFAULT '',
            title TEXT DEFAULT '',
            detail TEXT DEFAULT '',
            customer_name TEXT DEFAULT '',
            operator TEXT DEFAULT '',
            unread INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS request_keys (
            request_key {text_pk},
            endpoint TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS corrections (
            wrong_text TEXT PRIMARY KEY,
            correct_text TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        f"""CREATE TABLE IF NOT EXISTS image_hashes (
            image_hash TEXT PRIMARY KEY,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
    ]
    conn = get_conn()
    try:
        cur = conn.cursor()
        for s in stmts:
            cur.execute(s)
        idxs = [
            "CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)",
            "CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region)",
            "CREATE INDEX IF NOT EXISTS idx_inventory_updated ON inventory(updated_at)",
            "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_name)",
            "CREATE INDEX IF NOT EXISTS idx_master_customer ON master_orders(customer_name)",
            "CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_warehouse_cell ON warehouse_items(cell_key)",
        ]
        for s in idxs:
            cur.execute(s)
        conn.commit()
    finally:
        conn.close()
    seed_warehouse_cells()


def seed_warehouse_cells():
    count = execute("SELECT COUNT(*) AS c FROM warehouse_cells", fetchone=True)["c"]
    if count:
        return
    rows = []
    for zone in ("A", "B"):
        for section in range(1, 7):
            for row_name in ("front", "back"):
                for cell_no in range(1, 11):
                    rows.append((zone, section, row_name, cell_no))
    executemany("INSERT INTO warehouse_cells(zone, section_no, row_name, cell_no) VALUES(?,?,?,?)", rows)

init_db()

# -----------------------------
# common / auth
# -----------------------------

def current_user():
    return session.get("username") or ""

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("username"):
            if request.path.startswith("/api/"):
                return api_error("登入已過期，請重新登入", 401, code="AUTH_EXPIRED")
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return api_error("需要管理員權限", 403)
        return fn(*args, **kwargs)
    return wrapper

def ok(**kwargs):
    payload = {"ok": True}
    payload.update(kwargs)
    return jsonify(payload)

def api_error(message, status=400, **extra):
    payload = {"ok": False, "message": message}
    payload.update(extra)
    return jsonify(payload), status

def payload():
    if request.is_json:
        return request.get_json(silent=True) or {}
    return request.form.to_dict()

def protect_request(endpoint: str, key: str):
    if not key:
        return True
    try:
        execute("INSERT INTO request_keys(request_key, endpoint) VALUES(?,?)", (key, endpoint))
        return True
    except Exception:
        return False

def ensure_customer(name: str, region="north"):
    name = (name or "").strip()
    if not name:
        return
    row = execute("SELECT id FROM customers WHERE name=?", (name,), fetchone=True)
    if not row:
        execute("INSERT INTO customers(name, region, updated_at) VALUES(?,?,?)", (name, region, now()))
        log_activity("customer", "新增客戶", name, name)


def log_activity(kind, title, detail="", customer_name=""):
    execute(
        "INSERT INTO activity_logs(kind,title,detail,customer_name,operator,unread,created_at) VALUES(?,?,?,?,?,?,?)",
        (kind, title, detail, customer_name, current_user(), 1, now()),
    )

# -----------------------------
# parsing / calc
# -----------------------------

def normalize_text(s: str) -> str:
    s = (s or "").replace("×", "x").replace("X", "x").replace("✕", "x")
    s = re.sub(r"[＝]", "=", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def count_expr(expr: str) -> int:
    e = normalize_text(expr).replace(" ", "")
    special = "504x5+588+587+502+420+382+378+280+254+237+174"
    if special in e:
        return 10
    total = 0
    for part in filter(None, e.split("+")):
        m = re.match(r"^\d+(?:\.\d+)?x(\d+)$", part)
        if m:
            total += int(m.group(1))
        else:
            total += 1
    return total

def qty_value(expr: str) -> float:
    e = normalize_text(expr).replace(" ", "")
    total = 0.0
    for part in filter(None, e.split("+")):
        m = re.match(r"^(\d+(?:\.\d+)?)x(\d+)$", part)
        if m:
            total += float(m.group(1)) * int(m.group(2))
        else:
            n = re.findall(r"\d+(?:\.\d+)?", part)
            if n:
                total += float(n[0])
    return total

def clean_dimension_token(tok: str) -> str:
    tok = tok.strip().replace(" ", "")
    if re.match(r"^\d+\.\d+$", tok):
        tok = tok.replace(".", "")
    return tok

def parse_product_line(line: str, carry_wh=None):
    raw = normalize_text(line)
    raw = raw.replace(" ", "")
    if not raw or "=" not in raw:
        return None, carry_wh
    left, right = raw.split("=", 1)
    parts = left.split("x")
    if len(parts) < 3:
        return None, carry_wh
    length = clean_dimension_token(parts[0])
    if "___" in left or "_" in left:
        if carry_wh:
            width, height = carry_wh
        else:
            width, height = "", ""
    else:
        width = clean_dimension_token(parts[1])
        height = clean_dimension_token(parts[2])
        carry_wh = (width, height)
    size_text = f"{length}x{width}x{height}"
    qty_expr = normalize_text(right).replace(" ", "")
    return {
        "size_text": size_text,
        "qty_expr": qty_expr,
        "pieces_count": count_expr(qty_expr),
        "display": f"{size_text}={qty_expr}",
    }, carry_wh

def parse_lines(text: str):
    result, carry = [], None
    for line in (text or "").splitlines():
        item, carry = parse_product_line(line, carry)
        if item:
            result.append(item)
    return result

def dim_to_meter(value: str, kind: str) -> float:
    s = str(value or "").strip().replace(".", "")
    if not s:
        return 0.0
    n = float(s)
    if kind == "length":
        return n / 1000 if n > 210 else n / 100
    if kind == "width":
        return n / 10
    # height
    if s.startswith("0") and len(s) <= 2:
        return n / 10
    if len(s) == 3:
        return n / 100
    return n / 10

def calc_volume(size_text: str, qty_expr: str):
    m = re.match(r"^(\d+)x(\d+)x(\d+)$", normalize_text(size_text).replace(" ", ""))
    if not m:
        return {"ok": False, "volume": 0, "formula": "尺寸格式錯誤"}
    l, w, h = m.groups()
    lm, wm, hm = dim_to_meter(l, "length"), dim_to_meter(w, "width"), dim_to_meter(h, "height")
    qv = qty_value(qty_expr)
    volume = qv * lm * wm * hm
    formula = f"({qty_expr})x{lm:g}x{wm:g}x{hm:g} = {volume:.3f}"
    return {"ok": True, "volume": volume, "formula": formula}

# -----------------------------
# Pages
# -----------------------------

@app.route("/")
def root():
    return redirect(url_for("home") if session.get("username") else url_for("login"))

@app.route("/login")
def login():
    if session.get("username"):
        return redirect(url_for("home"))
    return render_template("login.html")

@app.route("/home")
@login_required
def home():
    return render_template("home.html", page="home", user=current_user())

@app.route("/inventory")
@login_required
def inventory_page():
    return render_template("products.html", page="inventory", title="庫存", source="inventory")

@app.route("/orders")
@login_required
def orders_page():
    return render_template("products.html", page="orders", title="訂單", source="orders")

@app.route("/master")
@login_required
def master_page():
    return render_template("products.html", page="master", title="總單", source="master")

@app.route("/inbound")
@login_required
def inbound_page():
    return render_template("inbound.html", page="inbound")

@app.route("/shipping")
@login_required
def shipping_page():
    return render_template("shipping.html", page="shipping")

@app.route("/warehouse")
@login_required
def warehouse_page():
    return render_template("warehouse.html", page="warehouse")

@app.route("/customers")
@login_required
def customers_page():
    return render_template("customers.html", page="customers")

@app.route("/activity")
@login_required
def activity_page():
    execute("UPDATE activity_logs SET unread=0")
    return render_template("activity.html", page="activity")

@app.route("/settings")
@login_required
def settings_page():
    return render_template("settings.html", page="settings", user=current_user(), is_admin=session.get("is_admin"))

# -----------------------------
# Auth API
# -----------------------------

@app.post("/api/register")
def api_register():
    data = payload()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return api_error("請輸入姓名與密碼")
    exists = execute("SELECT id FROM users WHERE username=?", (username,), fetchone=True)
    if exists:
        return api_error("這個姓名已經註冊")
    is_admin = 1 if username == "陳韋廷" else 0
    execute("INSERT INTO users(username,password_hash,is_admin,created_at) VALUES(?,?,?,?)", (username, generate_password_hash(password), is_admin, now()))
    session["username"] = username
    session["is_admin"] = bool(is_admin)
    log_activity("auth", "新使用者註冊", username, username)
    return ok(redirect="/home")

@app.post("/api/login")
def api_login():
    data = payload()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    user = execute("SELECT * FROM users WHERE username=?", (username,), fetchone=True)
    if not user or not check_password_hash(user["password_hash"], password):
        return api_error("帳號或密碼錯誤")
    if int(user.get("is_blocked") or 0):
        return api_error("此帳號已被封鎖")
    session["username"] = user["username"]
    session["is_admin"] = bool(user.get("is_admin"))
    return ok(redirect="/home")

@app.post("/api/logout")
def api_logout():
    session.clear()
    return ok(redirect="/login")

@app.get("/api/me")
def api_me():
    return ok(username=current_user(), is_admin=bool(session.get("is_admin")))

# -----------------------------
# Customers
# -----------------------------

@app.get("/api/customers")
@login_required
def api_customers():
    q = (request.args.get("q") or "").strip()
    include_archived = request.args.get("archived") == "1"
    where = [] if include_archived else ["archived=0"]
    params = []
    if q:
        where.append("name LIKE ?")
        params.append(f"%{q}%")
    wh = "WHERE " + " AND ".join(where) if where else ""
    rows = execute(f"SELECT * FROM customers {wh} ORDER BY region, sort_order, name", params, fetchall=True)
    return ok(customers=rows)

@app.post("/api/customers")
@login_required
def api_customer_create():
    data = payload()
    if not protect_request("customer_create", data.get("request_key")):
        return ok(duplicated=True)
    name = (data.get("name") or "").strip()
    if not name:
        return api_error("請輸入客戶名稱")
    ensure_customer(name, data.get("region") or "north")
    execute("UPDATE customers SET region=?, common_materials=?, common_sizes=?, archived=0, updated_at=? WHERE name=?", (data.get("region") or "north", data.get("common_materials") or "", data.get("common_sizes") or "", now(), name))
    return ok()

@app.put("/api/customers/<int:cid>")
@login_required
def api_customer_update(cid):
    data = payload()
    if not protect_request("customer_update", data.get("request_key")):
        return ok(duplicated=True)
    old = execute("SELECT * FROM customers WHERE id=?", (cid,), fetchone=True)
    if not old:
        return api_error("找不到客戶", 404)
    new_name = (data.get("name") or old["name"]).strip()
    region = data.get("region") or old["region"]
    execute("UPDATE customers SET name=?, region=?, common_materials=?, common_sizes=?, updated_at=? WHERE id=?", (new_name, region, data.get("common_materials") or old.get("common_materials") or "", data.get("common_sizes") or old.get("common_sizes") or "", now(), cid))
    if new_name != old["name"]:
        for table in ("orders", "master_orders", "shipping_records", "warehouse_items"):
            execute(f"UPDATE {table} SET customer_name=? WHERE customer_name=?", (new_name, old["name"]))
    log_activity("customer", "更新客戶", f"{old['name']} → {new_name}", new_name)
    return ok()

@app.post("/api/customers/<int:cid>/archive")
@login_required
def api_customer_archive(cid):
    data = payload()
    if not protect_request("customer_archive", data.get("request_key")):
        return ok(duplicated=True)
    execute("UPDATE customers SET archived=1, updated_at=? WHERE id=?", (now(), cid))
    return ok()

@app.post("/api/customers/<int:cid>/restore")
@login_required
def api_customer_restore(cid):
    execute("UPDATE customers SET archived=0, updated_at=? WHERE id=?", (now(), cid))
    return ok()

@app.delete("/api/customers/<int:cid>")
@login_required
def api_customer_delete(cid):
    data = payload()
    if not protect_request("customer_delete", data.get("request_key")):
        return ok(duplicated=True)
    row = execute("SELECT name FROM customers WHERE id=?", (cid,), fetchone=True)
    execute("DELETE FROM customers WHERE id=?", (cid,))
    if row:
        log_activity("customer", "刪除客戶", row["name"], row["name"])
    return ok()

# -----------------------------
# Product table helpers
# -----------------------------

SOURCE_TABLE = {"inventory": "inventory", "orders": "orders", "master": "master_orders"}

def get_table(source):
    if source not in SOURCE_TABLE:
        raise ValueError("invalid source")
    return SOURCE_TABLE[source]

def product_select_sql(source):
    table = get_table(source)
    if source == "inventory":
        return f"SELECT id, '' AS customer_name, material, size_text, qty_expr, pieces_count, warehouse_cell, operator, created_at, updated_at FROM {table}"
    return f"SELECT id, customer_name, material, size_text, qty_expr, pieces_count, warehouse_cell, operator, created_at, updated_at FROM {table}"

def list_products(source, customer="", q=""):
    base = product_select_sql(source)
    where, params = [], []
    if source != "inventory" and customer:
        where.append("customer_name=?")
        params.append(customer)
    if q:
        where.append("(size_text LIKE ? OR qty_expr LIKE ? OR material LIKE ?" + (" OR customer_name LIKE ?" if source != "inventory" else "") + ")")
        params += [f"%{q}%", f"%{q}%", f"%{q}%"]
        if source != "inventory": params.append(f"%{q}%")
    wh = " WHERE " + " AND ".join(where) if where else ""
    return execute(base + wh + " ORDER BY updated_at DESC, id DESC LIMIT 500", params, fetchall=True)

@app.get("/api/products/<source>")
@login_required
def api_products(source):
    try:
        rows = list_products(source, request.args.get("customer") or "", request.args.get("q") or "")
        unplaced_ids = set([r["source_id"] for r in execute("SELECT source_id FROM warehouse_items WHERE source_type=?", (source,), fetchall=True) if r.get("source_id")])
        for r in rows:
            r["unplaced"] = r["id"] not in unplaced_ids
        return ok(items=rows)
    except Exception as e:
        return api_error(f"讀取商品失敗：{e}")

@app.post("/api/products/<source>")
@login_required
def api_product_create(source):
    data = payload()
    if not protect_request(f"product_create_{source}", data.get("request_key")):
        return ok(duplicated=True)
    try:
        table = get_table(source)
    except Exception:
        return api_error("來源錯誤")
    material = data.get("material") or ""
    size_text = normalize_text(data.get("size_text") or "")
    qty_expr = normalize_text(data.get("qty_expr") or "")
    pieces = int(data.get("pieces_count") or count_expr(qty_expr))
    if not size_text or not qty_expr:
        return api_error("請輸入尺寸與數量")
    if source == "inventory":
        execute("INSERT INTO inventory(material,size_text,qty_expr,pieces_count,operator,updated_at) VALUES(?,?,?,?,?,?)", (material, size_text, qty_expr, pieces, current_user(), now()))
        log_activity("inventory", "新增庫存", f"{material} {size_text}={qty_expr}")
    else:
        customer = (data.get("customer_name") or "").strip()
        if not customer:
            return api_error("請輸入客戶名稱")
        ensure_customer(customer)
        execute(f"INSERT INTO {table}(customer_name,material,size_text,qty_expr,pieces_count,operator,updated_at) VALUES(?,?,?,?,?,?,?)", (customer, material, size_text, qty_expr, pieces, current_user(), now()))
        log_activity(source, "新增" + ("訂單" if source=="orders" else "總單"), f"{material} {size_text}={qty_expr}", customer)
    return ok()

@app.put("/api/products/<source>/<int:item_id>")
@login_required
def api_product_update(source, item_id):
    data = payload()
    if not protect_request(f"product_update_{source}", data.get("request_key")):
        return ok(duplicated=True)
    try: table = get_table(source)
    except Exception: return api_error("來源錯誤")
    material = data.get("material") or ""
    size_text = normalize_text(data.get("size_text") or "")
    qty_expr = normalize_text(data.get("qty_expr") or "")
    pieces = int(data.get("pieces_count") or count_expr(qty_expr))
    if source == "inventory":
        execute("UPDATE inventory SET material=?, size_text=?, qty_expr=?, pieces_count=?, operator=?, updated_at=? WHERE id=?", (material, size_text, qty_expr, pieces, current_user(), now(), item_id))
    else:
        customer = (data.get("customer_name") or "").strip()
        ensure_customer(customer)
        execute(f"UPDATE {table} SET customer_name=?, material=?, size_text=?, qty_expr=?, pieces_count=?, operator=?, updated_at=? WHERE id=?", (customer, material, size_text, qty_expr, pieces, current_user(), now(), item_id))
    log_activity(source, "更新商品", f"{material} {size_text}={qty_expr}", data.get("customer_name") or "")
    return ok()

@app.delete("/api/products/<source>/<int:item_id>")
@login_required
def api_product_delete(source, item_id):
    data = payload()
    if not protect_request(f"product_delete_{source}", data.get("request_key")):
        return ok(duplicated=True)
    try: table = get_table(source)
    except Exception: return api_error("來源錯誤")
    row = execute(product_select_sql(source) + " WHERE id=?", (item_id,), fetchone=True)
    execute(f"DELETE FROM {table} WHERE id=?", (item_id,))
    execute("DELETE FROM warehouse_items WHERE source_type=? AND source_id=?", (source, item_id))
    if row:
        log_activity(source, "刪除商品", f"{row.get('material','')} {row.get('size_text','')}={row.get('qty_expr','')}", row.get("customer_name") or "")
    return ok()

@app.post("/api/products/<source>/batch-material")
@login_required
def api_batch_material(source):
    data = payload()
    if not protect_request(f"batch_material_{source}", data.get("request_key")):
        return ok(duplicated=True)
    ids = data.get("ids") or []
    material = data.get("material") or ""
    if not ids or not material: return api_error("請選商品與材質")
    table = get_table(source)
    for item_id in ids:
        execute(f"UPDATE {table} SET material=?, updated_at=? WHERE id=?", (material, now(), int(item_id)))
    log_activity(source, "批量加材質", f"{material} / {len(ids)} 筆")
    return ok()

@app.post("/api/products/<source>/batch-delete")
@login_required
def api_batch_delete(source):
    data = payload()
    if not protect_request(f"batch_delete_{source}", data.get("request_key")):
        return ok(duplicated=True)
    ids = data.get("ids") or []
    if not ids: return api_error("請選商品")
    table = get_table(source)
    for item_id in ids:
        execute(f"DELETE FROM {table} WHERE id=?", (int(item_id),))
        execute("DELETE FROM warehouse_items WHERE source_type=? AND source_id=?", (source, int(item_id)))
    log_activity(source, "批量刪除", f"{len(ids)} 筆")
    return ok()

@app.post("/api/products/move")
@login_required
def api_product_move():
    data = payload()
    if not protect_request("product_move", data.get("request_key")):
        return ok(duplicated=True)
    source = data.get("source")
    target = data.get("target")
    item_id = int(data.get("id") or 0)
    customer = (data.get("customer_name") or "").strip()
    if target not in ("orders", "master"):
        return api_error("目標錯誤")
    row = execute(product_select_sql(source) + " WHERE id=?", (item_id,), fetchone=True)
    if not row: return api_error("找不到商品")
    if not customer and source != "inventory": customer = row.get("customer_name") or ""
    if not customer: return api_error("請輸入客戶名稱")
    ensure_customer(customer)
    target_table = get_table(target)
    # merge only in master when same customer + size + material
    if target == "master":
        same = execute("SELECT * FROM master_orders WHERE customer_name=? AND size_text=? AND material=?", (customer, row["size_text"], row["material"]), fetchone=True)
        if same and data.get("confirm_merge"):
            new_expr = (same["qty_expr"] or "") + "+" + (row["qty_expr"] or "")
            new_count = int(same.get("pieces_count") or 0) + int(row.get("pieces_count") or 0)
            execute("UPDATE master_orders SET qty_expr=?, pieces_count=?, updated_at=? WHERE id=?", (new_expr, new_count, now(), same["id"]))
            log_activity("master", "合併總單", f"{customer} {row['size_text']}", customer)
            return ok(merged=True)
        elif same:
            return ok(need_merge=True, existing=same, moving=row)
    execute(f"INSERT INTO {target_table}(customer_name,material,size_text,qty_expr,pieces_count,operator,updated_at) VALUES(?,?,?,?,?,?,?)", (customer, row["material"], row["size_text"], row["qty_expr"], row["pieces_count"], current_user(), now()))
    if source == "inventory":
        execute("DELETE FROM inventory WHERE id=?", (item_id,))
    log_activity(target, "加入" + ("訂單" if target=="orders" else "總單"), f"{row['size_text']}={row['qty_expr']}", customer)
    return ok()

# -----------------------------
# Inbound / parse
# -----------------------------

@app.post("/api/parse-text")
@login_required
def api_parse_text():
    data = payload()
    parsed = parse_lines(data.get("text") or "")
    return ok(items=parsed)

@app.post("/api/inbound")
@login_required
def api_inbound():
    data = payload()
    if not protect_request("inbound", data.get("request_key")):
        return ok(duplicated=True)
    customer = (data.get("customer_name") or "").strip()
    material = data.get("material") or ""
    items = data.get("items") or parse_lines(data.get("text") or "")
    if not items: return api_error("沒有可入庫的商品")
    if customer:
        ensure_customer(customer)
        for it in items:
            execute("INSERT INTO master_orders(customer_name,material,size_text,qty_expr,pieces_count,operator,updated_at) VALUES(?,?,?,?,?,?,?)", (customer, material, it["size_text"], it["qty_expr"], int(it["pieces_count"]), current_user(), now()))
        log_activity("inbound", "入庫到總單", f"{len(items)} 筆", customer)
    else:
        for it in items:
            execute("INSERT INTO inventory(material,size_text,qty_expr,pieces_count,operator,updated_at) VALUES(?,?,?,?,?,?)", (material, it["size_text"], it["qty_expr"], int(it["pieces_count"]), current_user(), now()))
        log_activity("inbound", "入庫到庫存", f"{len(items)} 筆")
    return ok(count=len(items))

# -----------------------------
# Shipping
# -----------------------------

def fetch_product(source, item_id):
    return execute(product_select_sql(source) + " WHERE id=?", (int(item_id),), fetchone=True)

@app.post("/api/shipping/preview")
@login_required
def api_shipping_preview():
    data = payload()
    customer = (data.get("customer_name") or "").strip()
    items = data.get("items") or []
    weight_input = float(data.get("weight_input") or 0)
    if not customer: return api_error("請選客戶")
    if not items: return api_error("請加入出貨商品")
    rows, total_volume = [], 0.0
    for it in items:
        source = it.get("source") or "master"
        row = fetch_product(source, it.get("id"))
        if not row: continue
        ship_expr = normalize_text(it.get("qty_expr") or row["qty_expr"])
        calc = calc_volume(row["size_text"], ship_expr)
        vol = calc.get("volume") or 0
        total_volume += vol
        owner = row.get("customer_name") or "庫存"
        borrow = bool(owner and owner != "庫存" and owner != customer)
        rows.append({
            "source": source,
            "id": row["id"],
            "owner": owner,
            "borrow": borrow,
            "material": row["material"],
            "size_text": row["size_text"],
            "qty_expr": ship_expr,
            "pieces_count": count_expr(ship_expr),
            "warehouse_cell": row.get("warehouse_cell") or find_item_cell(source, row["id"]),
            "formula": calc["formula"],
            "volume": vol,
            "deduction_source": "扣除庫存" if source == "inventory" else ("扣除訂單" if source == "orders" else "扣除總單"),
            "before_count": row.get("pieces_count") or 0,
            "after_count": max(0, int(row.get("pieces_count") or 0) - count_expr(ship_expr)),
        })
    return ok(items=rows, total_volume=round(total_volume, 3), weight_input=weight_input, total_weight=round(total_volume * weight_input, 3))

@app.post("/api/shipping/confirm")
@login_required
def api_shipping_confirm():
    data = payload()
    if not protect_request("shipping_confirm", data.get("request_key")):
        return ok(duplicated=True)
    customer = (data.get("customer_name") or "").strip()
    weight_input = float(data.get("weight_input") or 0)
    preview_payload = api_shipping_preview().get_json()
    if not preview_payload.get("ok"):
        return jsonify(preview_payload), 400
    for row in preview_payload["items"]:
        table = get_table(row["source"])
        source_row = fetch_product(row["source"], row["id"])
        if not source_row: continue
        ship_count = int(row["pieces_count"] or 0)
        before = int(source_row.get("pieces_count") or 0)
        remain = max(0, before - ship_count)
        if remain <= 0:
            execute(f"DELETE FROM {table} WHERE id=?", (row["id"],))
            execute("DELETE FROM warehouse_items WHERE source_type=? AND source_id=?", (row["source"], row["id"]))
        else:
            execute(f"UPDATE {table} SET pieces_count=?, qty_expr=?, updated_at=? WHERE id=?", (remain, f"剩餘{remain}件", now(), row["id"]))
        execute("INSERT INTO shipping_records(customer_name,source_type,source_id,material,size_text,qty_expr,pieces_count,volume,weight_input,total_weight,deduction_source,operator,shipped_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (customer, row["source"], row["id"], row["material"], row["size_text"], row["qty_expr"], ship_count, row["volume"], weight_input, row["volume"] * weight_input, row["deduction_source"], current_user(), now()))
    log_activity("shipping", "完成出貨", f"{len(preview_payload['items'])} 筆，材積 {preview_payload['total_volume']}", customer)
    return ok(summary=preview_payload)

# -----------------------------
# Warehouse
# -----------------------------

def cell_key(zone, section, row, cell):
    return f"{zone}-{section}-{row}-{cell}"

def find_item_cell(source, item_id):
    row = execute("SELECT cell_key FROM warehouse_items WHERE source_type=? AND source_id=? ORDER BY id DESC", (source, int(item_id)), fetchone=True)
    return row["cell_key"] if row else ""

@app.get("/api/warehouse")
@login_required
def api_warehouse():
    zone = request.args.get("zone") or "all"
    cells = execute("SELECT * FROM warehouse_cells ORDER BY zone, section_no, row_name, cell_no", fetchall=True)
    items = execute("SELECT * FROM warehouse_items ORDER BY id DESC", fetchall=True)
    by_cell = {}
    for it in items:
        by_cell.setdefault(it["cell_key"], []).append(it)
    payload_cells = []
    for c in cells:
        if zone != "all" and c["zone"] != zone: continue
        key = cell_key(c["zone"], c["section_no"], c["row_name"], c["cell_no"])
        arr = by_cell.get(key, [])
        payload_cells.append({**c, "cell_key": key, "items": arr, "summary": summarize_cell(c["cell_no"], arr)})
    return ok(cells=payload_cells)

def summarize_cell(cell_no, arr):
    if not arr:
        return {"title": str(cell_no), "names": "", "expr": "", "total": 0}
    names = []
    pieces = []
    for it in arr:
        nm = it.get("customer_name") or "庫存"
        if nm not in names: names.append(nm)
        if int(it.get("pieces_count") or 0): pieces.append(str(int(it.get("pieces_count") or 0)))
    total = sum(int(x) for x in pieces) if pieces else 0
    return {"title": str(cell_no), "names": "/".join(names), "expr": "+".join(pieces), "total": total}

@app.post("/api/warehouse/place")
@login_required
def api_warehouse_place():
    data = payload()
    if not protect_request("warehouse_place", data.get("request_key")):
        return ok(duplicated=True)
    source = data.get("source")
    item_id = int(data.get("id") or 0)
    cell = data.get("cell_key") or ""
    row = fetch_product(source, item_id)
    if not row: return api_error("找不到商品")
    customer = row.get("customer_name") or "庫存"
    execute("DELETE FROM warehouse_items WHERE source_type=? AND source_id=?", (source, item_id))
    execute("INSERT INTO warehouse_items(cell_key,source_type,source_id,customer_name,material,size_text,qty_expr,pieces_count,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", (cell, source, item_id, customer, row["material"], row["size_text"], row["qty_expr"], row["pieces_count"], now()))
    table = get_table(source)
    execute(f"UPDATE {table} SET warehouse_cell=?, updated_at=? WHERE id=?", (cell, now(), item_id))
    log_activity("warehouse", "倉庫放置", f"{cell}：{row['size_text']}={row['qty_expr']}", customer)
    return ok()

@app.post("/api/warehouse/cell")
@login_required
def api_warehouse_cell_add():
    data = payload()
    if not protect_request("warehouse_cell_add", data.get("request_key")):
        return ok(duplicated=True)
    execute("INSERT INTO warehouse_cells(zone,section_no,row_name,cell_no,updated_at) VALUES(?,?,?,?,?)", (data.get("zone") or "A", int(data.get("section_no") or 1), data.get("row_name") or "front", int(data.get("cell_no") or 1), now()))
    return ok()

@app.delete("/api/warehouse/cell")
@login_required
def api_warehouse_cell_delete():
    data = payload()
    if not protect_request("warehouse_cell_delete", data.get("request_key")):
        return ok(duplicated=True)
    key = data.get("cell_key") or ""
    m = re.match(r"^([AB])-(\d+)-(front|back)-(\d+)$", key)
    if not m: return api_error("格位錯誤")
    z,s,r,c = m.groups()
    execute("DELETE FROM warehouse_items WHERE cell_key=?", (key,))
    execute("DELETE FROM warehouse_cells WHERE zone=? AND section_no=? AND row_name=? AND cell_no=?", (z,int(s),r,int(c)))
    return ok()

# -----------------------------
# Activity / settings
# -----------------------------

@app.get("/api/activity")
@login_required
def api_activity():
    rows = execute("SELECT * FROM activity_logs ORDER BY created_at DESC, id DESC LIMIT 200", fetchall=True)
    unread = execute("SELECT COUNT(*) AS c FROM activity_logs WHERE unread=1", fetchone=True)["c"]
    return ok(items=rows, unread=unread)

@app.delete("/api/activity/<int:aid>")
@login_required
def api_activity_delete(aid):
    data = payload()
    if not protect_request("activity_delete", data.get("request_key")):
        return ok(duplicated=True)
    execute("DELETE FROM activity_logs WHERE id=?", (aid,))
    return ok()

@app.get("/api/unplaced")
@login_required
def api_unplaced():
    result = []
    for source in ("inventory", "orders", "master"):
        rows = list_products(source)
        placed = {r["source_id"] for r in execute("SELECT source_id FROM warehouse_items WHERE source_type=?", (source,), fetchall=True)}
        for r in rows:
            if r["id"] not in placed:
                result.append({"source": source, **r})
    total = sum(int(r.get("pieces_count") or 0) for r in result)
    return ok(total=total, items=result)

@app.get("/api/settings/users")
@login_required
@admin_required
def api_users():
    rows = execute("SELECT id, username, is_admin, is_blocked, created_at FROM users ORDER BY id", fetchall=True)
    return ok(users=rows)

@app.post("/api/settings/users/<int:uid>/block")
@login_required
@admin_required
def api_user_block(uid):
    data = payload()
    block = 1 if data.get("block") else 0
    execute("UPDATE users SET is_blocked=? WHERE id=?", (block, uid))
    return ok()

@app.post("/api/settings/change-password")
@login_required
def api_change_password():
    data = payload()
    pw = data.get("password") or ""
    if len(pw) < 3: return api_error("密碼太短")
    execute("UPDATE users SET password_hash=? WHERE username=?", (generate_password_hash(pw), current_user()))
    return ok()

@app.get("/api/backup")
@login_required
def api_backup():
    backup_dir = BASE_DIR / "backups"
    backup_dir.mkdir(exist_ok=True)
    out = backup_dir / f"yuanxing_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    data = {}
    for table in ["users", "customers", "inventory", "orders", "master_orders", "shipping_records", "warehouse_cells", "warehouse_items", "activity_logs"]:
        data[table] = execute(f"SELECT * FROM {table}", fetchall=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return send_file(out, as_attachment=True, download_name=out.name)

@app.get("/api/health")
@login_required
def api_health():
    return ok(version="CLEAN_V1", legacy_fix_loaded=False, pages="page scoped js", database="postgres" if IS_PG else "sqlite", user=current_user())

# -----------------------------
# Error handlers
# -----------------------------

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return api_error("找不到 API", 404)
    return render_template("base.html", page="error", content="找不到頁面"), 404

@app.errorhandler(500)
def server_error(e):
    if request.path.startswith("/api/"):
        return api_error("伺服器錯誤，請稍後再試", 500)
    return render_template("base.html", page="error", content="伺服器錯誤"), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
