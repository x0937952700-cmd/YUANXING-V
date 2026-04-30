import os
from datetime import datetime
from flask import Flask, render_template, jsonify
import psycopg2
from psycopg2.pool import SimpleConnectionPool

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "yuanxing-clean-ui-dev")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
_pool = None
_db_status_cache = {"ok": False, "message": "尚未檢查", "checked_at": None}

PAGES = {
    "inventory": "庫存",
    "orders": "訂單",
    "master_order": "總單",
    "ship": "出貨",
    "shipping_query": "出貨查詢",
    "warehouse": "倉庫圖",
    "customers": "客戶資料",
    "todos": "代辦事項",
}

def get_pool():
    global _pool
    if not DATABASE_URL:
        return None
    if _pool is None:
        _pool = SimpleConnectionPool(1, 3, DATABASE_URL, connect_timeout=4, sslmode="require")
    return _pool

def check_db(create_meta=False):
    global _db_status_cache
    if not DATABASE_URL:
        _db_status_cache = {"ok": False, "message": "未設定 DATABASE_URL", "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        return _db_status_cache
    conn = None
    try:
        pool = get_pool()
        conn = pool.getconn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            if create_meta:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS ui_shell_meta (
                        id SERIAL PRIMARY KEY,
                        name TEXT UNIQUE,
                        value TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                cur.execute("""
                    INSERT INTO ui_shell_meta(name, value, updated_at)
                    VALUES('clean_ui_boot', 'ok', CURRENT_TIMESTAMP)
                    ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value, updated_at=CURRENT_TIMESTAMP
                """)
                conn.commit()
        _db_status_cache = {"ok": True, "message": "PostgreSQL 已連線", "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    except Exception as exc:
        if conn:
            conn.rollback()
        _db_status_cache = {"ok": False, "message": f"PostgreSQL 連線失敗：{type(exc).__name__}", "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    finally:
        try:
            if conn and _pool:
                _pool.putconn(conn)
        except Exception:
            pass
    return _db_status_cache

@app.before_request
def _fast_boot_check():
    # 不在每次載入都打資料庫，避免卡頓；只用快取狀態。
    pass

@app.route("/", methods=["GET", "HEAD"])
def home():
    return render_template("index.html", username="陳韋廷", db_status=_db_status_cache, pages=PAGES)

@app.route("/login", methods=["GET", "HEAD"])
def login_page():
    return render_template("login.html", db_status=_db_status_cache)

@app.route("/settings", methods=["GET", "HEAD"])
def settings_page():
    return render_template("settings.html", db_status=_db_status_cache)

@app.route("/today_changes", methods=["GET", "HEAD"])
def today_changes_page():
    return render_template("today_changes.html", db_status=_db_status_cache)

@app.route("/module/<module_key>", methods=["GET", "HEAD"])
def module_page(module_key):
    title = PAGES.get(module_key, "頁面")
    return render_template("module.html", module_key=module_key, title=title, db_status=_db_status_cache, pages=PAGES)

# 與舊檔案相同的路徑名稱，方便直接替換後點開。
for rule, key in [
    ("/inventory", "inventory"), ("/orders", "orders"), ("/master_order", "master_order"),
    ("/ship", "ship"), ("/shipping_query", "shipping_query"), ("/warehouse", "warehouse"),
    ("/customers", "customers"), ("/todos", "todos"),
]:
    app.add_url_rule(rule, endpoint=f"{key}_page", view_func=lambda key=key: module_page(key), methods=["GET", "HEAD"])

@app.route("/api/db-check")
def api_db_check():
    return jsonify(check_db(create_meta=True))

@app.route("/healthz")
def healthz():
    return jsonify({"ok": True, "db": _db_status_cache})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
