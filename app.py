
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from datetime import timedelta, datetime
from functools import wraps
import os
import hashlib
import json
from PIL import Image

from db import (
    init_db, get_user, create_user, update_password, log_action,
    save_inventory_item, list_inventory, save_order, save_master_order,
    ship_order, preview_ship_order, get_shipping_records, save_correction, log_error,
    save_image_hash, image_hash_exists, upsert_customer, get_customers,
    get_customer, warehouse_get_cells, warehouse_save_cell, warehouse_move_item, warehouse_add_column,
    warehouse_add_slot, warehouse_remove_slot, warehouse_delete_column,
    inventory_summary, warehouse_summary, list_backups, get_orders, get_master_orders,
    list_users, set_user_blocked, get_setting, set_setting, get_ocr_usage, verify_password, row_to_dict, get_db, sql, rows_to_dict, fetchone_dict, now
)
from ocr import process_ocr_text, parse_ocr_text
from backup import run_daily_backup

app = Flask(__name__)
_SECRET_KEY = os.getenv("SECRET_KEY")
if not _SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is required")
app.secret_key = _SECRET_KEY
app.permanent_session_lifetime = timedelta(days=30)

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic", "gif"}
MAX_UPLOAD_SIZE = 16 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

init_db()

PUBLIC_PATHS = {
    "login", "api_login", "health", "static"
}

def current_username():
    return session.get("user", "")

def require_login():
    return bool(current_username())

def login_required_json(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not require_login():
            return jsonify(success=False, error="請先登入"), 401
        return f(*args, **kwargs)
    return wrapper

@app.before_request
def protect_pages():
    path = request.path
    if path.startswith("/static/") or path in ("/health",):
        return None
    public = [
        "/login", "/api/login", "/api/health"
    ]
    if path in public:
        return None
    if not require_login() and path not in ("/",):
        # Let / redirect to login
        if path.startswith("/api/"):
            return jsonify(success=False, error="請先登入"), 401
        return redirect(url_for("login_page"))
    return None

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def error_response(msg, code=400):
    return jsonify({"success": False, "error": msg}), code

def compress_image(path):
    try:
        img = Image.open(path)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        if img.width > 1800:
            ratio = 1800 / float(img.width)
            img = img.resize((1800, int(img.height * ratio)))
        img.save(path, "JPEG", quality=78, optimize=True)
    except Exception as e:
        log_error("compress_image", str(e))

def parse_lines_to_items(text):
    parsed = parse_ocr_text(text)
    return parsed["items"], parsed["text"]

def grouped_inventory():
    return inventory_summary()

def customer_groups():
    customers = get_customers()
    groups = {"北區": [], "中區": [], "南區": []}
    for c in customers:
        region = c.get("region") or "北區"
        if region not in groups:
            region = "北區"
        groups[region].append(c)
    return groups

@app.route("/")
def home():
    if not require_login():
        return redirect(url_for("login_page"))
    return render_template("index.html", username=current_username(), title="沅興木業", today=datetime.now().strftime('%Y-%m-%d'))

@app.route("/login")
def login_page():
    if require_login():
        return redirect(url_for("home"))
    return render_template("login.html", title="登入")

@app.route("/settings")
def settings_page():
    is_admin = current_username() == '陳韋廷'
    return render_template("settings.html", username=current_username(), title="設定", is_admin=is_admin, google_ocr_enabled=(str(get_setting('google_ocr_enabled', '1')) == '1'), google_ocr_usage=get_ocr_usage('google_vision', datetime.now().strftime('%Y-%m')))

@app.route("/inventory")
def inventory_page():
    return render_template("module.html", module_key="inventory", title="庫存", username=current_username())

@app.route("/orders")
def orders_page():
    return render_template("module.html", module_key="orders", title="訂單", username=current_username())

@app.route("/master-order")
def master_order_page():
    return render_template("module.html", module_key="master_order", title="總單", username=current_username())

@app.route("/ship")
def ship_page():
    return render_template("module.html", module_key="ship", title="出貨", username=current_username())

@app.route("/shipping-query")
def shipping_query_page():
    return render_template("module.html", module_key="shipping_query", title="出貨查詢", username=current_username())

@app.route("/warehouse")
def warehouse_page():
    return render_template("module.html", module_key="warehouse", title="倉庫圖", username=current_username())

@app.route("/customers")
def customers_page():
    return render_template("module.html", module_key="customers", title="客戶資料", username=current_username())

@app.route("/today-changes")
def today_changes_page():
    return render_template("today_changes.html", username=current_username(), title="今日異動")

@app.route("/api/login", methods=["POST"])
def api_login():
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get("username") or data.get("name") or "").strip()
        password = (data.get("password") or "").strip()
        if not username or not password:
            return error_response("帳號密碼不可空白")
        user = get_user(username)
        if user and int(user.get('is_blocked') or 0) == 1:
            try:
                log_action(username or 'unknown', '黑名單登入攔截')
            except Exception:
                pass
            return error_response("此帳號已被停用", 403)
        if not user:
            create_user(username, password)
            log_action(username, "建立帳號")
            user = get_user(username) or {}
        else:
            if not verify_password(user.get('password'), password):
                return error_response("密碼錯誤", 403)
            # 舊明碼資料第一次成功登入後自動升級為 hash
            if user.get('password') == password:
                update_password(username, password)
                user = get_user(username) or user
        session.permanent = True
        session["user"] = username
        session["role"] = user.get('role') or ("admin" if username == "陳韋廷" else "user")
        log_action(username, "登入系統")
        return jsonify(success=True, username=username, role=session.get("role"))
    except Exception as e:
        log_error("api_login", str(e))
        return error_response("登入失敗")

@app.route("/api/logout", methods=["POST"])
@login_required_json
def api_logout():
    user = current_username()
    session.clear()
    try:
        log_action(user, "登出系統")
    except Exception:
        pass
    return jsonify(success=True)

@app.route("/api/change_password", methods=["POST"])
@login_required_json
def api_change_password():
    try:
        data = request.get_json(silent=True) or {}
        old_password = (data.get("old_password") or "").strip()
        new_password = (data.get("new_password") or "").strip()
        confirm_password = (data.get("confirm_password") or "").strip()
        user = get_user(current_username())
        if not user or not verify_password(user.get('password'), old_password):
            return error_response("舊密碼錯誤")
        if not new_password or len(new_password) < 4:
            return error_response("新密碼至少 4 碼")
        if new_password != confirm_password:
            return error_response("兩次密碼不一致")
        update_password(current_username(), new_password)
        log_action(current_username(), "修改密碼")
        return jsonify(success=True)
    except Exception as e:
        log_error("change_password", str(e))
        return error_response("修改失敗")

@app.route("/api/upload_ocr", methods=["POST"])
@login_required_json
def api_upload_ocr():
    try:
        file = request.files.get("file")
        if not file:
            return error_response("未選擇圖片")
        if not allowed_file(file.filename):
            return error_response("圖片格式錯誤")
        content = file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            return error_response("圖片過大")
        image_hash = hashlib.md5(content).hexdigest()
        ext = file.filename.rsplit(".", 1)[1].lower()
        filename = f"{image_hash}.{ext}"
        path = os.path.join(UPLOAD_FOLDER, filename)
        with open(path, "wb") as f:
            f.write(content)
        compress_image(path)
        roi_raw = request.form.get("roi") or ""
        roi = None
        if roi_raw:
            try:
                roi = json.loads(roi_raw)
            except Exception:
                roi = None
        handwriting_mode = str(request.form.get("handwriting_mode") or "0").lower() in ("1", "true", "yes", "on")
        duplicate_existing = image_hash_exists(image_hash)
        result = process_ocr_text(path, roi=roi, handwriting_mode=handwriting_mode)
        items = result.get('items') or []
        normalized_text = result.get('text') or ''
        if not normalized_text and items:
            normalized_text = '\n'.join([
                (it.get('raw_text') or ((it.get('product_text') or '') + (f"x{int(it.get('qty') or 1)}" if int(it.get('qty') or 1) != 1 else '')))
                for it in items if (it.get('raw_text') or it.get('product_text'))
            ])
        raw_text = result.get('raw_text') or normalized_text
        customer_guess = result.get('customer_guess') or ''
        has_output = bool(normalized_text.strip() or raw_text.strip() or customer_guess or items)
        template = result.get("template", "auto")
        template_name = {"whiteboard": "白板模板", "shipping_note": "出貨單模板", "auto": "自動模式"}.get(template, "自動模式")
        if not result.get('success') and not has_output:
            specific_error = result.get('error') or ''
            if not (os.getenv('GOOGLE_VISION_API_KEY') or os.getenv('GOOGLE_API_KEY')):
                specific_error = specific_error or 'Google OCR 金鑰未設定'
            elif str(get_setting('google_ocr_enabled', '1')) != '1':
                specific_error = specific_error or 'Google OCR 已被停用'
            else:
                specific_error = specific_error or f'{template_name}未抓到可辨識內容，可改手動微調範圍後再試'
            return error_response(specific_error)
        if not duplicate_existing:
            save_image_hash(image_hash)
        confidence = int(result.get("confidence", 0))
        warning = result.get('warning', '')
        if has_output and (not normalized_text or not customer_guess):
            missing_parts = []
            if not customer_guess:
                missing_parts.append('客戶名稱')
            if not normalized_text:
                missing_parts.append('商品文字')
            warning = warning or (f'已辨識部分內容，請確認{'、'.join(missing_parts)}' if missing_parts else '')
        elif has_output:
            warning = warning or f'{template_name}已自動套用並完成辨識'
        log_action(current_username(), f"OCR辨識[{','.join(result.get('engines', []))}]/{template}")
        return jsonify(
            success=True,
            duplicate_existing=duplicate_existing,
            image_hash=image_hash,
            text=normalized_text,
            raw_text=raw_text,
            items=items,
            confidence=confidence,
            warning=warning,
            engines=result.get("engines", []),
            customer_guess=customer_guess,
            template=template,
            template_name=template_name,
            suggested_roi=result.get("suggested_roi"),
            partial=bool(has_output and (not normalized_text or not customer_guess)),
            sync_time=int(os.path.getmtime(path))
        )
    except Exception as e:
        log_error("upload_ocr", str(e))
        return error_response("OCR辨識失敗")

@app.route("/api/save_correction", methods=["POST"])
@login_required_json
def api_save_correction():
    try:
        data = request.get_json(silent=True) or {}
        wrong = (data.get("wrong_text") or "").strip()
        correct = (data.get("correct_text") or "").strip()
        if wrong and correct and wrong != correct:
            save_correction(wrong, correct)
            log_action(current_username(), f"修正OCR {wrong}->{correct}")
        return jsonify(success=True)
    except Exception as e:
        log_error("save_correction", str(e))
        return error_response("儲存失敗")

def _parse_items_from_request(data):
    items = data.get("items") or []
    if items:
        cleaned = []
        for it in items:
            qty = int(it.get("qty", 0))
            if qty <= 0:
                continue
            cleaned.append({
                "product_text": it.get("product_text") or it.get("product") or "",
                "product_code": it.get("product_code") or "",
                "qty": qty
            })
        return cleaned
    text = data.get("ocr_text") or data.get("text") or ""
    parsed_items, _ = parse_lines_to_items(text)
    return [{"product_text": it["product_text"], "product_code": it.get("product_code", ""), "qty": int(it["qty"])} for it in parsed_items]

@app.route("/api/inventory", methods=["GET", "POST"])
@login_required_json
def api_inventory():
    try:
        if request.method == "GET":
            return jsonify(success=True, items=grouped_inventory())
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        operator = current_username()
        location = (data.get("location") or "").strip()
        customer_name = (data.get("customer_name") or "").strip()
        for it in items:
            save_inventory_item(it["product_text"], it.get("product_code", ""), int(it["qty"]), location, customer_name, operator, data.get("ocr_text", ""))
        log_action(operator, "建立庫存")
        return jsonify(success=True, items=grouped_inventory())
    except Exception as e:
        log_error("inventory", str(e))
        return error_response("建立失敗")

@app.route("/api/orders", methods=["GET", "POST"])
@login_required_json
def api_orders():
    try:
        if request.method == "GET":
            return jsonify(success=True, items=get_orders())
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        upsert_customer(customer_name)
        save_order(customer_name, items, current_username())
        log_action(current_username(), "建立訂單")
        return jsonify(success=True, items=get_orders())
    except Exception as e:
        log_error("orders", str(e))
        return error_response("訂單建立失敗")

@app.route("/api/master_orders", methods=["GET", "POST"])
@login_required_json
def api_master_orders():
    try:
        if request.method == "GET":
            return jsonify(success=True, items=get_master_orders())
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        upsert_customer(customer_name)
        save_master_order(customer_name, items, current_username())
        log_action(current_username(), "更新總單")
        return jsonify(success=True, items=get_master_orders())
    except Exception as e:
        log_error("master_orders", str(e))
        return error_response("總單失敗")

@app.route("/api/ship", methods=["POST"])
@login_required_json
def api_ship():
    try:
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        upsert_customer(customer_name)
        allow_inventory_fallback = bool(data.get("allow_inventory_fallback"))
        result = ship_order(customer_name, items, current_username(), allow_inventory_fallback=allow_inventory_fallback)
        if result.get("success"):
            log_action(current_username(), "完成出貨")
        return jsonify(result)
    except Exception as e:
        log_error("ship", str(e))
        return error_response("出貨失敗")

@app.route("/api/shipping_records", methods=["GET"])
@login_required_json
def api_shipping_records():
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    q = (request.args.get("q") or '').strip()
    rows = get_shipping_records(start_date=start_date, end_date=end_date, q=q)
    return jsonify(success=True, records=rows)

@app.route("/api/ship-preview", methods=["POST"])
@login_required_json
def api_ship_preview():
    try:
        data = request.get_json(silent=True) or {}
        items = _parse_items_from_request(data)
        customer_name = (data.get("customer_name") or "").strip()
        if not customer_name:
            return error_response("請輸入客戶名稱")
        if not items:
            return error_response("沒有可預覽的商品")
        return jsonify(preview_ship_order(customer_name, items))
    except Exception as e:
        log_error("ship_preview", str(e))
        return error_response("出貨預覽失敗")

@app.route("/api/customers", methods=["GET", "POST"])
@login_required_json
def api_customers():
    try:
        if request.method == "GET":
            return jsonify(success=True, items=get_customers())
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return error_response("請輸入客戶名稱")
        upsert_customer(
            name,
            phone=(data.get("phone") or "").strip(),
            address=(data.get("address") or "").strip(),
            notes=(data.get("notes") or "").strip(),
            region=(data.get("region") or "北區").strip()
        )
        log_action(current_username(), f"儲存客戶 {name}")
        return jsonify(success=True, items=get_customers())
    except Exception as e:
        log_error("customers", str(e))
        return error_response("客戶儲存失敗")

@app.route("/api/customers/<name>", methods=["GET"])
@login_required_json
def api_customer_detail(name):
    row = get_customer(name)
    return jsonify(success=True, item=row)

@app.route("/api/warehouse", methods=["GET"])
@login_required_json
def api_warehouse():
    return jsonify(success=True, zones=warehouse_summary(), cells=warehouse_get_cells())

@app.route("/api/warehouse/cell", methods=["POST"])
@login_required_json
def api_warehouse_cell():
    try:
        data = request.get_json(silent=True) or {}
        zone = data.get("zone")
        column_index = int(data.get("column_index"))
        slot_type = data.get("slot_type") or 'direct'
        slot_number = int(data.get("slot_number"))
        items = data.get("items") or []
        note = data.get("note") or ""
        warehouse_save_cell(zone, column_index, slot_type, slot_number, items, note)
        log_action(current_username(), f"更新倉庫格位 {zone}{column_index}-{slot_type}-{slot_number}")
        return jsonify(success=True, zones=warehouse_summary())
    except Exception as e:
        log_error("warehouse_cell", str(e))
        return error_response("格位更新失敗")

@app.route("/api/warehouse/move", methods=["POST"])
@login_required_json
def api_warehouse_move():
    try:
        data = request.get_json(silent=True) or {}
        from_key = data.get("from_key")
        to_key = data.get("to_key")
        product_text = data.get("product_text")
        qty = int(data.get("qty", 1))
        if not (from_key and to_key and product_text):
            return error_response("缺少參數")
        result = warehouse_move_item(tuple(from_key), tuple(to_key), product_text, qty)
        if result.get("success"):
            log_action(current_username(), f"拖曳商品 {product_text}")
        return jsonify(result)
    except Exception as e:
        log_error("warehouse_move", str(e))
        return error_response("拖曳失敗")

@app.route("/api/warehouse/add-column", methods=["POST"])
@login_required_json
def api_warehouse_add_column():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        if zone not in ("A", "B"):
            return error_response("區域錯誤")
        column_index = warehouse_add_column(zone)
        log_action(current_username(), f"新增格子欄 {zone}{column_index}")
        return jsonify(success=True, column_index=column_index, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_add_column", str(e))
        return error_response("新增格子失敗")

@app.route("/api/warehouse/search")
@login_required_json
def api_warehouse_search():
    q = (request.args.get("q") or "").strip()
    cells = warehouse_get_cells()
    matched = []
    for cell in cells:
        try:
            items = json.loads(cell.get("items_json") or "[]")
        except Exception:
            items = []
        for it in items:
            hay = f"{cell['zone']} {cell['column_index']} {cell['slot_type']} {cell['slot_number']} {it.get('product_text','')} {it.get('customer_name','')}"
            if not q or q.lower() in hay.lower():
                matched.append({"cell": cell, "item": it})
                break
    return jsonify(success=True, items=matched)

@app.route("/api/warehouse/available-items", methods=["GET"])
@login_required_json
def api_warehouse_available_items():
    inv = inventory_summary()
    options = [r for r in inv if int(r.get("unplaced_qty", 0)) > 0]
    return jsonify(success=True, items=options)


@app.route("/api/customer-items", methods=["GET"])
@login_required_json
def api_customer_items():
    name = (request.args.get("name") or "").strip()
    inv = list_inventory()
    orders = get_orders()
    masters = get_master_orders()
    items = []
    if name:
        for row in orders:
            if row.get("customer_name") == name:
                items.append({"source": "訂單", **row})
        for row in masters:
            if row.get("customer_name") == name:
                items.append({"source": "總單", **row})
        for row in inv:
            if row.get("customer_name") == name:
                items.append({"source": "庫存", **row})
    else:
        items = []
    return jsonify(success=True, items=items)

@app.route("/api/backup", methods=["POST", "GET"])
@login_required_json
def api_backup():
    return jsonify(run_daily_backup())

@app.route("/api/backups", methods=["GET"])
@login_required_json
def api_backups():
    return jsonify(list_backups())


@app.route("/api/admin/users", methods=["GET"])
@login_required_json
def api_admin_users():
    if current_username() != '陳韋廷':
        return error_response("權限不足", 403)
    return jsonify(success=True, items=list_users())

@app.route("/api/admin/block", methods=["POST"])
@login_required_json
def api_admin_block():
    if current_username() != '陳韋廷':
        return error_response("權限不足", 403)
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    blocked = bool(data.get('blocked'))
    if not username or username == '陳韋廷':
        return error_response("不可操作此帳號")
    set_user_blocked(username, blocked)
    log_action(current_username(), f"{'封鎖' if blocked else '解除封鎖'}帳號 {username}")
    return jsonify(success=True, items=list_users())

@app.route("/api/warehouse/add-slot", methods=["POST"])
@login_required_json
def api_warehouse_add_slot():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index"))
        slot_type = 'direct'
        slot_number = warehouse_add_slot(zone, column_index, slot_type)
        log_action(current_username(), f"新增格子 {zone}{column_index}-{slot_number}")
        return jsonify(success=True, slot_number=slot_number, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_add_slot", str(e))
        return error_response("新增格子失敗")

@app.route("/api/warehouse/remove-slot", methods=["POST"])
@login_required_json
def api_warehouse_remove_slot():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index"))
        slot_type = 'direct'
        slot_number = int(data.get("slot_number"))
        result = warehouse_remove_slot(zone, column_index, slot_type, slot_number)
        if not result.get('success'):
            return error_response(result.get('error') or '刪除格子失敗')
        log_action(current_username(), f"刪除格子 {zone}{column_index}-{slot_number}")
        return jsonify(success=True, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_remove_slot", str(e))
        return error_response("刪除格子失敗")

@app.route("/api/warehouse/delete-column", methods=["POST"])
@login_required_json
def api_warehouse_delete_column():
    try:
        data = request.get_json(silent=True) or {}
        zone = (data.get("zone") or "A").strip().upper()
        column_index = int(data.get("column_index"))
        result = warehouse_delete_column(zone, column_index)
        if not result.get('success'):
            return error_response(result.get('error') or '刪除欄位失敗')
        log_action(current_username(), f"刪除欄位 {zone}{column_index}")
        return jsonify(success=True, zones=warehouse_summary(), cells=warehouse_get_cells())
    except Exception as e:
        log_error("warehouse_delete_column", str(e))
        return error_response("刪除欄位失敗")



@app.route("/api/orders/to-master", methods=["POST"])
@login_required_json
def api_orders_to_master():
    try:
        data = request.get_json(silent=True) or {}
        customer_name = (data.get("customer_name") or "").strip()
        product_text = (data.get("product_text") or "").strip()
        product_code = (data.get("product_code") or "").strip()
        qty = int(data.get("qty") or 0)
        if not customer_name or not product_text or qty <= 0:
            return error_response("參數不足")
        upsert_customer(customer_name)
        save_master_order(customer_name, [{"product_text": product_text, "product_code": product_code, "qty": qty}], current_username())
        log_action(current_username(), f"訂單加入總單 {customer_name} {product_text}x{qty}")
        return jsonify(success=True, items=get_master_orders())
    except Exception as e:
        log_error("orders_to_master", str(e))
        return error_response("加入總單失敗")


def _today_key():
    return datetime.now().strftime('%Y-%m-%d')

def _aggregate_customer_products(rows):
    out = {}
    for r in rows:
        key = ((r.get('customer_name') or '').strip(), (r.get('product_text') or '').strip())
        out[key] = out.get(key, 0) + int(r.get('qty') or 0)
    return out

def _aggregate_inventory_products(rows):
    out = {}
    for r in rows:
        key = (r.get('product_text') or '').strip()
        out[key] = out.get(key, 0) + int(r.get('qty') or 0)
    return out


def _build_anomalies(inv_rows, order_rows, master_rows):
    anomalies = {
        'negative_inventory': [],
        'orders_over_master': [],
        'master_over_inventory': [],
        'unplaced': [],
        'duplicate_products': [],
        'shipping_deduction': [],
        'ocr_errors': [],
        'blocked_logins': [],
    }
    inv_by_product = _aggregate_inventory_products(inv_rows)
    ord_by_cp = _aggregate_customer_products(order_rows)
    mst_by_cp = _aggregate_customer_products(master_rows)

    for r in inv_rows:
        if int(r.get('qty') or 0) < 0:
            anomalies['negative_inventory'].append({'type':'negative_inventory','message':f"庫存負數：{r.get('product_text')} ({r.get('qty')})",'product_text':r.get('product_text') or ''})
        if int(r.get('unplaced_qty') or 0) > 0:
            anomalies['unplaced'].append({'type':'unplaced','message':f"未錄入倉庫圖：{r.get('product_text')} ({r.get('unplaced_qty')})",'product_text':r.get('product_text') or '', 'qty':int(r.get('unplaced_qty') or 0)})

    for key, oq in ord_by_cp.items():
        mq = int(mst_by_cp.get(key) or 0)
        if oq > mq:
            customer_name, product_text = key
            anomalies['orders_over_master'].append({'type':'orders_over_master','message':f"{customer_name}｜訂單大於總單：{product_text} ({oq}>{mq})",'customer_name':customer_name,'product_text':product_text,'order_qty':oq,'master_qty':mq})

    product_master_total = {}
    for (_, product_text), qty in mst_by_cp.items():
        product_master_total[product_text] = product_master_total.get(product_text, 0) + int(qty or 0)
    for product_text, mq in product_master_total.items():
        iq = int(inv_by_product.get(product_text) or 0)
        if mq > iq:
            anomalies['master_over_inventory'].append({'type':'master_over_inventory','message':f"總單大於庫存：{product_text} ({mq}>{iq})",'product_text':product_text,'master_qty':mq,'inventory_qty':iq})

    def _dups(rows, source_name):
        seen = {}
        for r in rows:
            key = ((r.get('customer_name') or '').strip(), (r.get('product_text') or '').strip())
            if not all(key):
                continue
            seen.setdefault(key, []).append(r)
        for key, vals in seen.items():
            if len(vals) > 1:
                anomalies['duplicate_products'].append({'type':'duplicate_products','message':f"{source_name}重複商品：{key[0]}｜{key[1]}（{len(vals)}筆）",'customer_name':key[0],'product_text':key[1],'source':source_name})
    _dups(order_rows, '訂單')
    _dups(master_rows, '總單')

    try:
        conn = get_db(); cur = conn.cursor(); today = _today_key()
        cur.execute(sql("SELECT customer_name, product_text, note, shipped_at FROM shipping_records WHERE substr(shipped_at,1,10)=? ORDER BY shipped_at DESC"), (today,))
        for r in rows_to_dict(cur):
            note = r.get('note') or ''
            if '補扣' in note:
                anomalies['shipping_deduction'].append({'type':'shipping_deduction','message':f"出貨補扣：{r.get('customer_name')}｜{r.get('product_text')}｜{note}"})
        cur.execute(sql("SELECT source, message, created_at FROM errors WHERE substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 50"), (today,))
        for r in rows_to_dict(cur):
            src = (r.get('source') or '')
            if 'ocr' in src.lower() or 'google' in src.lower():
                anomalies['ocr_errors'].append({'type':'ocr_errors','message':f"OCR異常：{src}｜{r.get('message') or ''}"})
        cur.execute(sql("SELECT username, action, created_at FROM logs WHERE substr(created_at,1,10)=? AND action LIKE ? ORDER BY created_at DESC LIMIT 50"), (today, '%黑名單登入攔截%'))
        for r in rows_to_dict(cur):
            anomalies['blocked_logins'].append({'type':'blocked_logins','message':f"黑名單登入異常：{r.get('username') or ''}"})
        conn.close()
    except Exception:
        pass

    return anomalies


def _today_changes_payload():
    conn = get_db()
    cur = conn.cursor()
    today = _today_key()
    cur.execute(sql("SELECT id, username, action, created_at FROM logs WHERE substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 200"), (today,))
    logs = rows_to_dict(cur)
    conn.close()

    inbound = []
    outbound = []
    new_orders = []
    others = []
    for r in logs:
        action = r.get('action') or ''
        if '出貨' in action:
            outbound.append(r)
        elif '訂單' in action:
            new_orders.append(r)
        elif any(k in action for k in ['庫存', '進貨', 'OCR', '總單', '儲存客戶']):
            inbound.append(r)
        else:
            others.append(r)

    inv = inventory_summary()
    orders = get_orders()
    masters = get_master_orders()
    anomalies = _build_anomalies(inv, orders, masters)
    anomaly_list = []
    for key in ['negative_inventory', 'orders_over_master', 'master_over_inventory', 'duplicate_products', 'shipping_deduction', 'ocr_errors', 'blocked_logins']:
        anomaly_list.extend(anomalies.get(key, []))
    unplaced = anomalies['unplaced']
    read_at = get_setting('today_changes_read_at', '') or ''
    unread_count = len([r for r in logs if not read_at or (r.get('created_at') or '') > read_at])

    return {
        'summary': {
            'inbound_count': len(inbound),
            'outbound_count': len(outbound),
            'new_order_count': len(new_orders),
            'unplaced_count': len(unplaced),
            'anomaly_count': len(anomaly_list),
            'unread_count': unread_count,
        },
        'feed': {
            'inbound': inbound[:60],
            'outbound': outbound[:60],
            'new_orders': new_orders[:60],
            'others': others[:40],
        },
        'unplaced_items': unplaced[:120],
        'anomalies': anomaly_list[:120],
        'anomaly_groups': anomalies,
        'read_at': read_at,
    }

@app.route('/api/today-changes', methods=['GET'])
@login_required_json
def api_today_changes():
    return jsonify(success=True, **_today_changes_payload())

@app.route('/api/today-changes/read', methods=['POST'])
@login_required_json
def api_today_changes_mark_read():
    try:
        set_setting('today_changes_read_at', now())
        return jsonify(success=True)
    except Exception as e:
        log_error('today_changes_mark_read', str(e))
        return error_response('清除已讀失敗')

@app.route('/api/today-changes/<int:log_id>', methods=['DELETE'])
@login_required_json
def api_today_change_delete(log_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(sql('DELETE FROM logs WHERE id = ?'), (log_id,))
        conn.commit()
        conn.close()
        return jsonify(success=True, **_today_changes_payload())
    except Exception as e:
        log_error('today_change_delete', str(e))
        return error_response('刪除異動失敗')

@app.route('/api/anomalies', methods=['GET'])
@login_required_json
def api_anomalies():
    payload = _today_changes_payload()
    return jsonify(success=True, groups=payload.get('anomaly_groups', {}), items=payload.get('anomalies', []), unplaced_items=payload.get('unplaced_items', []))


@app.route('/api/admin/google-ocr', methods=['GET'])
@login_required_json
def api_admin_google_ocr_get():
    if current_username() != '陳韋廷':
        return error_response('權限不足', 403)
    period = datetime.now().strftime('%Y-%m')
    return jsonify(success=True, enabled=(str(get_setting('google_ocr_enabled', '1')) == '1'), count=get_ocr_usage('google_vision', period), period=period, limit=980, remaining=max(0, 980 - get_ocr_usage('google_vision', period)), key_configured=bool(os.getenv('GOOGLE_VISION_API_KEY') or os.getenv('GOOGLE_API_KEY')))

@app.route('/api/admin/google-ocr', methods=['POST'])
@login_required_json
def api_admin_google_ocr_set():
    if current_username() != '陳韋廷':
        return error_response('權限不足', 403)
    data = request.get_json(silent=True) or {}
    enabled = '1' if bool(data.get('enabled')) else '0'
    set_setting('google_ocr_enabled', enabled)
    log_action(current_username(), f"Google OCR{'開啟' if enabled == '1' else '關閉'}")
    period = datetime.now().strftime('%Y-%m')
    return jsonify(success=True, enabled=(enabled=='1'), count=get_ocr_usage('google_vision', period), period=period, limit=980, remaining=max(0, 980 - get_ocr_usage('google_vision', period)), key_configured=bool(os.getenv('GOOGLE_VISION_API_KEY') or os.getenv('GOOGLE_API_KEY')))

@app.route("/health")
def health():
    return "OK"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)