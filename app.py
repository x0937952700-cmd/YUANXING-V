import hashlib
import io
import json
import os
import re
import sqlite3
from functools import wraps
from datetime import datetime
from flask import Flask, jsonify, render_template, request, session, send_file
from werkzeug.security import generate_password_hash, check_password_hash

from db import init_db, get_conn, execute, rows, row, now, log_activity, ensure_customer, check_request_key, save_request_key, IS_POSTGRES, SQLITE_PATH

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "yuanxing-clean-v1-change-me")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

DATA_TABLES = {"inventory": "inventory", "orders": "orders", "master": "master_orders", "master_orders": "master_orders"}
SOURCE_LABELS = {"inventory": "庫存", "orders": "訂單", "master_orders": "總單"}


def current_user():
    return session.get("username", "")


def api_ok(**kwargs):
    payload = {"ok": True}
    payload.update(kwargs)
    return jsonify(payload)


def api_error(message, status=400, **kwargs):
    payload = {"ok": False, "error": message}
    payload.update(kwargs)
    return jsonify(payload), status


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return api_error("登入已過期，請重新登入", 401)
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return api_error("登入已過期，請重新登入", 401)
        if not session.get("is_admin"):
            return api_error("需要管理員權限", 403)
        return fn(*args, **kwargs)
    return wrapper


def normalize_text(text):
    text = (text or "").strip()
    table = str.maketrans({"×": "x", "X": "x", "✕": "x", "＊": "x", "*": "x", "＝": "=", "＋": "+"})
    text = text.translate(table)
    text = re.sub(r"\s+", "", text)
    text = text.replace("1.65", "165").replace("0.63", "063")
    return text


def parse_product(text):
    clean = normalize_text(text)
    m = re.match(r"([^=]+)=?(.*)", clean)
    left = m.group(1) if m else clean
    right = m.group(2) if m else ""
    dims = re.split(r"x", left)
    length = dims[0] if len(dims) > 0 else ""
    width = dims[1] if len(dims) > 1 else ""
    height = dims[2] if len(dims) > 2 else ""
    bundles = 0
    pieces_sum = 0
    if right:
        parts = [p for p in right.split("+") if p]
        for part in parts:
            mm = re.match(r"(\d+)(?:x(\d+))?$", part)
            if mm:
                mult = int(mm.group(2) or 1)
                bundles += mult
                pieces_sum += mult
            else:
                bundles += 1
                pieces_sum += 1
    return {
        "product_text": clean,
        "length": length,
        "width": width,
        "height": height,
        "formula": right,
        "pieces": pieces_sum,
        "bundles": bundles,
        "qty": pieces_sum,
    }


def dim_to_meter(v):
    s = str(v or "").strip()
    if not s:
        return 0.0
    try:
        n = float(s)
    except ValueError:
        return 0.0
    # 使用者規則：長度超過 210 變 0.xxx；其他如 80=>0.8、140=>1.4；厚度 063=>0.63、125=>1.25
    if n > 210:
        return n / 1000.0
    if len(s) == 3 and s.startswith("0"):
        return n / 100.0
    if n >= 100:
        return n / 100.0
    return n / 100.0


def formula_units(formula):
    formula = normalize_text(formula)
    if not formula:
        return 0, "0"
    parts = [p for p in formula.split("+") if p]
    terms = []
    total = 0
    for p in parts:
        m = re.match(r"(\d+)(?:x(\d+))?$", p)
        if m:
            a = int(m.group(1))
            b = int(m.group(2) or 1)
            total += a * b
            terms.append(f"{a}x{b}" if b != 1 else str(a))
    return total, "+".join(terms) or "0"


def volume_for_product(product_text):
    p = parse_product(product_text)
    total_units, units_expr = formula_units(p["formula"])
    l = dim_to_meter(p["length"])
    w = dim_to_meter(p["width"])
    h = dim_to_meter(p["height"])
    volume = total_units * l * w * h
    expr = f"({units_expr})x{l:g}x{w:g}x{h:g}"
    return volume, expr


def get_json():
    return request.get_json(silent=True) or {}


@app.before_request
def boot():
    # Render/health HEAD must never throw template errors.
    if not getattr(app, "_yx_booted", False):
        init_db()
        app._yx_booted = True


@app.route("/", methods=["GET", "HEAD"])
def index():
    if request.method == "HEAD":
        return "", 200
    if not session.get("user_id"):
        return render_template("login.html")
    return render_template("app.html")


@app.route("/login", methods=["GET", "HEAD"])
def login_page():
    if request.method == "HEAD":
        return "", 200
    return render_template("login.html")


@app.route("/app", methods=["GET", "HEAD"])
def app_page():
    if request.method == "HEAD":
        return "", 200
    if not session.get("user_id"):
        return render_template("login.html")
    return render_template("app.html")


@app.post("/api/register")
def register():
    data = get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return api_error("請輸入姓名和密碼")
    with get_conn() as conn:
        count = row(execute(conn, "SELECT COUNT(*) AS c FROM users"))["c"]
        is_admin = 1 if count == 0 or username == "陳韋廷" else 0
        try:
            execute(conn, "INSERT INTO users(username, password_hash, is_admin, is_blocked, created_at) VALUES(?,?,?,?,?)",
                    (username, generate_password_hash(password), is_admin, 0, now()))
        except Exception:
            return api_error("此姓名已註冊，請直接登入")
        log_activity(conn, "帳號", "註冊", username, "", "新使用者註冊", username)
        session["user_id"] = row(execute(conn, "SELECT id FROM users WHERE username=?", (username,)))["id"]
        session["username"] = username
        session["is_admin"] = bool(is_admin)
    return api_ok(username=username, is_admin=bool(is_admin))


@app.post("/api/login")
def login():
    data = get_json()
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    with get_conn() as conn:
        u = row(execute(conn, "SELECT * FROM users WHERE username=?", (username,)))
        if not u or not check_password_hash(u["password_hash"], password):
            return api_error("帳號或密碼錯誤", 401)
        if u.get("is_blocked"):
            return api_error("此帳號已被封鎖，請聯絡管理員", 403)
        session["user_id"] = u["id"]
        session["username"] = u["username"]
        session["is_admin"] = bool(u.get("is_admin"))
    return api_ok(username=username, is_admin=bool(u.get("is_admin")))


@app.post("/api/logout")
def logout():
    session.clear()
    return api_ok()


@app.get("/api/me")
def me():
    return api_ok(logged_in=bool(session.get("user_id")), username=session.get("username", ""), is_admin=bool(session.get("is_admin")))


@app.get("/api/health")
def health():
    return api_ok(status="ready", db="postgres" if IS_POSTGRES else "sqlite", time=now())


@app.get("/api/users")
@admin_required
def users():
    with get_conn() as conn:
        data = rows(execute(conn, "SELECT id, username, is_admin, is_blocked, created_at FROM users ORDER BY id"))
    return api_ok(users=data)


@app.post("/api/users/<int:user_id>/block")
@admin_required
def block_user(user_id):
    data = get_json()
    blocked = 1 if data.get("blocked", True) else 0
    with get_conn() as conn:
        execute(conn, "UPDATE users SET is_blocked=? WHERE id=?", (blocked, user_id))
        log_activity(conn, "帳號", "封鎖" if blocked else "解除封鎖", "", "", f"user_id={user_id}", current_user())
    return api_ok()


@app.get("/api/customers")
@login_required
def list_customers():
    include_archived = request.args.get("archived") == "1"
    q = (request.args.get("q") or "").strip()
    with get_conn() as conn:
        sql = "SELECT * FROM customers WHERE 1=1"
        params = []
        if not include_archived:
            sql += " AND archived=0"
        if q:
            sql += " AND name LIKE ?"
            params.append(f"%{q}%")
        sql += " ORDER BY region, sort_order, name"
        data = rows(execute(conn, sql, tuple(params)))
    return api_ok(customers=data)


@app.post("/api/customers")
@login_required
def create_customer():
    data = get_json()
    name = (data.get("name") or "").strip()
    if not name:
        return api_error("請輸入客戶名稱")
    with get_conn() as conn:
        c = ensure_customer(conn, name, data.get("region") or "north")
        execute(conn, "UPDATE customers SET region=?, common_materials=?, common_sizes=?, archived=0, updated_at=? WHERE id=?",
                (data.get("region") or c.get("region") or "north", data.get("common_materials", c.get("common_materials", "")), data.get("common_sizes", c.get("common_sizes", "")), now(), c["id"]))
        log_activity(conn, "客戶", "新增/更新客戶", name, "", json.dumps(data, ensure_ascii=False), current_user())
    return api_ok()


@app.put("/api/customers/<int:cid>")
@login_required
def update_customer(cid):
    data = get_json()
    name = (data.get("name") or "").strip()
    if not name:
        return api_error("請輸入客戶名稱")
    with get_conn() as conn:
        old = row(execute(conn, "SELECT * FROM customers WHERE id=?", (cid,)))
        if not old:
            return api_error("找不到客戶", 404)
        execute(conn, "UPDATE customers SET name=?, region=?, common_materials=?, common_sizes=?, updated_at=? WHERE id=?",
                (name, data.get("region") or old.get("region") or "north", data.get("common_materials", ""), data.get("common_sizes", ""), now(), cid))
        if old["name"] != name:
            for table in DATA_TABLES.values():
                execute(conn, f"UPDATE {table} SET customer=? WHERE customer=?", (name, old["name"]))
            execute(conn, "UPDATE warehouse_items SET customer=? WHERE customer=?", (name, old["name"]))
        log_activity(conn, "客戶", "編輯客戶", name, "", f"原名:{old['name']}", current_user())
    return api_ok()


@app.delete("/api/customers/<int:cid>")
@login_required
def delete_customer(cid):
    with get_conn() as conn:
        old = row(execute(conn, "SELECT * FROM customers WHERE id=?", (cid,)))
        if not old:
            return api_error("找不到客戶", 404)
        execute(conn, "DELETE FROM customers WHERE id=?", (cid,))
        log_activity(conn, "客戶", "刪除客戶", old["name"], "", "", current_user())
    return api_ok()


@app.post("/api/customers/<int:cid>/archive")
@login_required
def archive_customer(cid):
    data = get_json()
    archived = 1 if data.get("archived", True) else 0
    with get_conn() as conn:
        execute(conn, "UPDATE customers SET archived=?, updated_at=? WHERE id=?", (archived, now(), cid))
        log_activity(conn, "客戶", "封存客戶" if archived else "還原客戶", "", "", f"id={cid}", current_user())
    return api_ok()


@app.get("/api/<kind>")
@login_required
def list_items(kind):
    table = DATA_TABLES.get(kind)
    if not table:
        return api_error("未知資料表", 404)
    q = (request.args.get("q") or "").strip()
    customer = (request.args.get("customer") or "").strip()
    with get_conn() as conn:
        sql = f"SELECT * FROM {table} WHERE status='active'"
        params = []
        if q:
            sql += " AND (product_text LIKE ? OR material LIKE ? OR customer LIKE ?)"
            params += [f"%{q}%", f"%{q}%", f"%{q}%"]
        if customer:
            sql += " AND customer=?"
            params.append(customer)
        sql += " ORDER BY COALESCE(height,''), COALESCE(width,''), COALESCE(length,''), id DESC"
        data = rows(execute(conn, sql, tuple(params)))
    return api_ok(items=data)


@app.post("/api/<kind>")
@login_required
def create_item(kind):
    table = DATA_TABLES.get(kind)
    if not table:
        return api_error("未知資料表", 404)
    data = get_json()
    request_key = data.get("request_key")
    with get_conn() as conn:
        dup = check_request_key(conn, request_key)
        if dup:
            return jsonify(dup)
        customer = (data.get("customer") or "").strip()
        product_text = data.get("product_text") or data.get("text") or ""
        if not product_text:
            return api_error("請輸入商品資料")
        p = parse_product(product_text)
        material = data.get("material", "")
        if customer:
            ensure_customer(conn, customer, data.get("region", "north"))
        t = now()
        execute(conn, f"""
            INSERT INTO {table}(customer, product_text, material, length, width, height, formula, pieces, bundles, qty, source, operator, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (customer, p["product_text"], material, p["length"], p["width"], p["height"], p["formula"], p["pieces"], p["bundles"], data.get("qty", p["qty"]), table, current_user(), t, t))
        log_activity(conn, SOURCE_LABELS.get(table, kind), "新增商品", customer, p["product_text"], material, current_user())
        resp = {"ok": True, "item": p}
        save_request_key(conn, request_key, resp)
    return jsonify(resp)


@app.put("/api/<kind>/<int:item_id>")
@login_required
def update_item(kind, item_id):
    table = DATA_TABLES.get(kind)
    if not table:
        return api_error("未知資料表", 404)
    data = get_json()
    product_text = data.get("product_text") or data.get("text") or ""
    if not product_text:
        return api_error("請輸入商品資料")
    p = parse_product(product_text)
    customer = (data.get("customer") or "").strip()
    with get_conn() as conn:
        if customer:
            ensure_customer(conn, customer)
        execute(conn, f"""
            UPDATE {table} SET customer=?, product_text=?, material=?, length=?, width=?, height=?, formula=?, pieces=?, bundles=?, qty=?, updated_at=? WHERE id=?
        """, (customer, p["product_text"], data.get("material", ""), p["length"], p["width"], p["height"], p["formula"], p["pieces"], p["bundles"], data.get("qty", p["qty"]), now(), item_id))
        log_activity(conn, SOURCE_LABELS.get(table, kind), "編輯商品", customer, p["product_text"], data.get("material", ""), current_user())
    return api_ok(item=p)


@app.delete("/api/<kind>/<int:item_id>")
@login_required
def delete_item(kind, item_id):
    table = DATA_TABLES.get(kind)
    if not table:
        return api_error("未知資料表", 404)
    with get_conn() as conn:
        old = row(execute(conn, f"SELECT * FROM {table} WHERE id=?", (item_id,)))
        execute(conn, f"UPDATE {table} SET status='deleted', updated_at=? WHERE id=?", (now(), item_id))
        if old:
            log_activity(conn, SOURCE_LABELS.get(table, kind), "刪除商品", old.get("customer", ""), old.get("product_text", ""), "", current_user())
    return api_ok()


@app.post("/api/<kind>/batch_material")
@login_required
def batch_material(kind):
    table = DATA_TABLES.get(kind)
    if not table:
        return api_error("未知資料表", 404)
    data = get_json()
    ids = data.get("ids") or []
    material = data.get("material") or ""
    if not ids:
        return api_error("請先選取商品")
    with get_conn() as conn:
        for i in ids:
            execute(conn, f"UPDATE {table} SET material=?, updated_at=? WHERE id=?", (material, now(), int(i)))
        log_activity(conn, SOURCE_LABELS.get(table, kind), "批量材質", "", "", f"{len(ids)}筆→{material}", current_user())
    return api_ok(count=len(ids))


@app.post("/api/<kind>/batch_delete")
@login_required
def batch_delete(kind):
    table = DATA_TABLES.get(kind)
    if not table:
        return api_error("未知資料表", 404)
    data = get_json()
    ids = data.get("ids") or []
    if not ids:
        return api_error("請先選取商品")
    with get_conn() as conn:
        for i in ids:
            execute(conn, f"UPDATE {table} SET status='deleted', updated_at=? WHERE id=?", (now(), int(i)))
        log_activity(conn, SOURCE_LABELS.get(table, kind), "批量刪除", "", "", f"{len(ids)}筆", current_user())
    return api_ok(count=len(ids))


@app.post("/api/<kind>/<int:item_id>/copy_to/<target>")
@login_required
def copy_item(kind, item_id, target):
    src = DATA_TABLES.get(kind)
    dst = DATA_TABLES.get(target)
    if not src or not dst:
        return api_error("未知來源或目標", 404)
    data = get_json()
    with get_conn() as conn:
        it = row(execute(conn, f"SELECT * FROM {src} WHERE id=?", (item_id,)))
        if not it:
            return api_error("找不到商品", 404)
        t = now()
        execute(conn, f"""
            INSERT INTO {dst}(customer, product_text, material, length, width, height, formula, pieces, bundles, qty, source, operator, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (data.get("customer", it.get("customer", "")), it["product_text"], it.get("material", ""), it.get("length", ""), it.get("width", ""), it.get("height", ""), it.get("formula", ""), it.get("pieces", 0), it.get("bundles", 0), it.get("qty", 0), src, current_user(), t, t))
        if data.get("deduct_source"):
            execute(conn, f"UPDATE {src} SET status='moved', updated_at=? WHERE id=?", (t, item_id))
        log_activity(conn, SOURCE_LABELS.get(dst, target), f"由{SOURCE_LABELS.get(src, kind)}加入", it.get("customer", ""), it.get("product_text", ""), "", current_user())
    return api_ok()


@app.get("/api/items/by_customer")
@login_required
def by_customer():
    customer = (request.args.get("customer") or "").strip()
    with get_conn() as conn:
        all_items = []
        for table in ("master_orders", "orders", "inventory"):
            params = []
            if table == "inventory" and not customer:
                sql = f"SELECT *, '{table}' AS source_table FROM {table} WHERE status='active'"
            else:
                sql = f"SELECT *, '{table}' AS source_table FROM {table} WHERE status='active' AND customer=?"
                params.append(customer)
            all_items.extend(rows(execute(conn, sql, tuple(params))))
    return api_ok(items=all_items)


@app.get("/api/warehouse")
@login_required
def warehouse():
    zone = request.args.get("zone", "all")
    with get_conn() as conn:
        params = []
        sql = "SELECT * FROM warehouse_cells"
        if zone in ("A", "B"):
            sql += " WHERE zone=?"
            params.append(zone)
        sql += " ORDER BY zone, section, row_name, slot_index"
        cells = rows(execute(conn, sql, tuple(params)))
        items = rows(execute(conn, "SELECT * FROM warehouse_items ORDER BY cell_id, position, id"))
    return api_ok(cells=cells, items=items)


@app.post("/api/warehouse/cells/<int:cell_id>/items")
@login_required
def save_cell_items(cell_id):
    data = get_json()
    items = data.get("items") or []
    with get_conn() as conn:
        execute(conn, "DELETE FROM warehouse_items WHERE cell_id=?", (cell_id,))
        for idx, it in enumerate(items):
            product_text = it.get("product_text", "")
            p = parse_product(product_text) if product_text else {"pieces": int(it.get("pieces") or 0)}
            execute(conn, """
                INSERT INTO warehouse_items(cell_id, source_table, item_id, customer, product_text, material, pieces, position, created_at, updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?)
            """, (cell_id, it.get("source_table", "manual"), it.get("item_id"), it.get("customer", ""), product_text, it.get("material", ""), it.get("pieces", p.get("pieces", 0)), idx, now(), now()))
        log_activity(conn, "倉庫", "儲存格子", "", "", f"cell_id={cell_id}, items={len(items)}", current_user())
    return api_ok()


@app.post("/api/warehouse/cells/<int:cell_id>/insert")
@login_required
def insert_cell(cell_id):
    with get_conn() as conn:
        c = row(execute(conn, "SELECT * FROM warehouse_cells WHERE id=?", (cell_id,)))
        if not c:
            return api_error("找不到格子", 404)
        execute(conn, "UPDATE warehouse_cells SET slot_index=slot_index+1 WHERE zone=? AND section=? AND row_name=? AND slot_index>?",
                (c["zone"], c["section"], c["row_name"], c["slot_index"]))
        execute(conn, "INSERT INTO warehouse_cells(zone, section, row_name, slot_index, created_at, updated_at) VALUES(?,?,?,?,?,?)",
                (c["zone"], c["section"], c["row_name"], c["slot_index"] + 1, now(), now()))
        log_activity(conn, "倉庫", "插入格子", "", "", json.dumps(c, ensure_ascii=False), current_user())
    return api_ok()


@app.delete("/api/warehouse/cells/<int:cell_id>")
@login_required
def delete_cell(cell_id):
    with get_conn() as conn:
        c = row(execute(conn, "SELECT * FROM warehouse_cells WHERE id=?", (cell_id,)))
        if not c:
            return api_error("找不到格子", 404)
        execute(conn, "DELETE FROM warehouse_items WHERE cell_id=?", (cell_id,))
        execute(conn, "DELETE FROM warehouse_cells WHERE id=?", (cell_id,))
        execute(conn, "UPDATE warehouse_cells SET slot_index=slot_index-1 WHERE zone=? AND section=? AND row_name=? AND slot_index>?",
                (c["zone"], c["section"], c["row_name"], c["slot_index"]))
        log_activity(conn, "倉庫", "刪除格子", "", "", json.dumps(c, ensure_ascii=False), current_user())
    return api_ok()


@app.get("/api/warehouse/unplaced")
@login_required
def unplaced():
    with get_conn() as conn:
        wh = rows(execute(conn, "SELECT source_table, item_id FROM warehouse_items WHERE item_id IS NOT NULL"))
        placed = {(x["source_table"], x["item_id"]) for x in wh}
        items = []
        total = 0
        for table in ("inventory", "orders", "master_orders"):
            for it in rows(execute(conn, f"SELECT *, '{table}' AS source_table FROM {table} WHERE status='active'")):
                if (table, it["id"]) not in placed:
                    items.append(it)
                    total += int(it.get("pieces") or 0)
    return api_ok(count=len(items), pieces=total, items=items)


@app.post("/api/parse_text")
@login_required
def parse_text_api():
    data = get_json()
    text = data.get("text") or ""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    out = []
    last_wh = ""
    for line in lines:
        line = normalize_text(line)
        if "___" in line and last_wh:
            line = line.replace("___", last_wh)
        p = parse_product(line)
        if p["width"] and p["height"]:
            last_wh = f"{p['width']}x{p['height']}"
        out.append(p["product_text"])
    return api_ok(lines=out, text="\n".join(out))


@app.post("/api/shipping/preview")
@login_required
def shipping_preview():
    data = get_json()
    items = data.get("items") or []
    weight_rate = float(data.get("weight_per_cbm") or 0)
    parts = []
    total_volume = 0.0
    total_length = 0.0
    normalized = []
    for it in items:
        text = it.get("product_text") or it.get("text") or ""
        p = parse_product(text)
        volume, expr = volume_for_product(p["product_text"])
        total_volume += volume
        try:
            total_length += float(p["length"] or 0) * max(1, int(it.get("ship_qty") or p.get("pieces") or 1))
        except Exception:
            pass
        parts.append(expr)
        normalized.append({**it, **p, "volume": round(volume, 4), "volume_expr": expr})
    return api_ok(items=normalized, volume=round(total_volume, 4), formula="+".join(parts) + f"={round(total_volume,4)}材積", length_total=round(total_length, 2), weight_per_cbm=weight_rate, total_weight=round(total_volume * weight_rate, 2))


@app.post("/api/shipping/confirm")
@login_required
def shipping_confirm():
    data = get_json()
    request_key = data.get("request_key")
    customer = (data.get("customer") or "").strip()
    items = data.get("items") or []
    weight_rate = float(data.get("weight_per_cbm") or 0)
    with get_conn() as conn:
        dup = check_request_key(conn, request_key)
        if dup:
            return jsonify(dup)
        summary = []
        total_volume = 0.0
        for it in items:
            table = it.get("source_table") or it.get("source") or "master_orders"
            if table not in ("master_orders", "orders", "inventory"):
                table = "master_orders"
            item_id = it.get("id") or it.get("item_id")
            ship_qty = int(it.get("ship_qty") or it.get("pieces") or 0)
            source_item = None
            if item_id:
                source_item = row(execute(conn, f"SELECT * FROM {table} WHERE id=?", (int(item_id),)))
            text = (source_item or it).get("product_text", "")
            volume, _ = volume_for_product(text)
            total_volume += volume
            if source_item:
                before = int(source_item.get("pieces") or source_item.get("qty") or 0)
                after = max(0, before - ship_qty) if ship_qty else 0
                status = "active" if after > 0 else "shipped"
                execute(conn, f"UPDATE {table} SET pieces=?, qty=?, status=?, updated_at=? WHERE id=?", (after, after, status, now(), item_id))
                summary.append(f"扣除{SOURCE_LABELS.get(table, table)}：{text} {before}→{after}")
            else:
                summary.append(f"手動出貨：{text} {ship_qty}件")
        execute(conn, """
            INSERT INTO shipping_records(customer, items_json, volume, length_total, weight_per_cbm, total_weight, deduction_summary, operator, shipped_at)
            VALUES(?,?,?,?,?,?,?,?,?)
        """, (customer, json.dumps(items, ensure_ascii=False), round(total_volume, 4), 0, weight_rate, round(total_volume * weight_rate, 2), "\n".join(summary), current_user(), now()))
        log_activity(conn, "出貨", "確認出貨", customer, "", "\n".join(summary), current_user())
        resp = {"ok": True, "summary": summary, "volume": round(total_volume, 4), "total_weight": round(total_volume * weight_rate, 2)}
        save_request_key(conn, request_key, resp)
    return jsonify(resp)


@app.get("/api/shipping_records")
@login_required
def shipping_records():
    q = (request.args.get("q") or "").strip()
    with get_conn() as conn:
        sql = "SELECT * FROM shipping_records WHERE 1=1"
        params = []
        if q:
            sql += " AND (customer LIKE ? OR deduction_summary LIKE ?)"
            params += [f"%{q}%", f"%{q}%"]
        sql += " ORDER BY id DESC LIMIT 300"
        data = rows(execute(conn, sql, tuple(params)))
    return api_ok(records=data)


@app.get("/api/activity")
@login_required
def activity():
    with get_conn() as conn:
        logs = rows(execute(conn, "SELECT * FROM activity_logs ORDER BY id DESC LIMIT 200"))
        unread = row(execute(conn, "SELECT COUNT(*) AS c FROM activity_logs WHERE unread=1"))["c"]
    return api_ok(logs=logs, unread=unread)


@app.post("/api/activity/read_all")
@login_required
def activity_read():
    with get_conn() as conn:
        execute(conn, "UPDATE activity_logs SET unread=0")
    return api_ok()


@app.delete("/api/activity/<int:log_id>")
@login_required
def activity_delete(log_id):
    with get_conn() as conn:
        execute(conn, "DELETE FROM activity_logs WHERE id=?", (log_id,))
    return api_ok()


@app.get("/api/backup")
@login_required
def backup():
    with get_conn() as conn:
        data = {}
        for t in ["users", "customers", "inventory", "orders", "master_orders", "warehouse_cells", "warehouse_items", "shipping_records", "activity_logs"]:
            data[t] = rows(execute(conn, f"SELECT * FROM {t}"))
    payload = json.dumps({"created_at": now(), "data": data}, ensure_ascii=False, indent=2).encode("utf-8")
    return send_file(io.BytesIO(payload), as_attachment=True, download_name=f"yuanxing_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", mimetype="application/json")


@app.post("/api/backup/restore")
@login_required
def restore_backup():
    if "file" not in request.files:
        return api_error("請選擇備份 JSON 檔")
    try:
        payload = json.loads(request.files["file"].read().decode("utf-8"))
        data = payload.get("data") or {}
    except Exception:
        return api_error("備份檔格式錯誤")
    safe_tables = ["activity_logs", "shipping_records", "warehouse_items", "warehouse_cells", "master_orders", "orders", "inventory", "customers", "users"]
    restore_tables = [t for t in safe_tables if t in data]
    with get_conn() as conn:
        for t in restore_tables:
            execute(conn, f"DELETE FROM {t}")
        for t in reversed(restore_tables):
            for r in data.get(t, []):
                if not isinstance(r, dict) or not r:
                    continue
                cols = list(r.keys())
                holders = ",".join(["?"] * len(cols))
                sql = f"INSERT INTO {t}({','.join(cols)}) VALUES({holders})"
                execute(conn, sql, tuple(r[c] for c in cols))
        log_activity(conn, "設定", "還原備份", "", "", f"tables={','.join(restore_tables)}", current_user())
    return api_ok(restored_tables=restore_tables)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
