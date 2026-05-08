
import os
import json
import shutil
from datetime import datetime

from db import get_db, USE_POSTGRES, DATABASE_URL, log_error

BACKUP_FOLDER = "backups"
os.makedirs(BACKUP_FOLDER, exist_ok=True)

def _backup_filename(prefix, ext):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return os.path.join(BACKUP_FOLDER, f"{prefix}_{timestamp}.{ext}")

def _trim_backups(prefix, keep=7):
    files = [f for f in os.listdir(BACKUP_FOLDER) if f.startswith(prefix + "_")]
    files = sorted(files)
    while len(files) > keep:
        old = files.pop(0)
        try:
            os.remove(os.path.join(BACKUP_FOLDER, old))
        except Exception:
            pass

def backup_sqlite():
    try:
        db_path = DATABASE_URL.replace("sqlite:///", "")
        target = _backup_filename("sqlite_backup", "db")
        shutil.copy2(db_path, target)
        _trim_backups("sqlite_backup")
        return {"success": True, "type": "sqlite", "file": target}
    except Exception as e:
        log_error("backup_sqlite", str(e))
        return {"success": False, "error": str(e)}

def backup_postgres():
    try:
        conn = get_db()
        cur = conn.cursor()
        tables = [
            "users", "customer_profiles", "inventory", "orders", "master_orders",
            "shipping_records", "corrections", "image_hashes", "logs", "errors", "warehouse_cells",
            "todo_items", "app_settings", "customer_aliases", "warehouse_recent_slots", "audit_trails",
            "operation_log", "warehouse_cell_items", "sync_events", "shipping_preview_snapshots"
        ]
        backup_data = {}
        for table in tables:
            cur.execute(f"SELECT * FROM {table}")
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            backup_data[table] = [dict(zip(cols, row)) for row in rows]
        conn.close()
        target = _backup_filename("postgres_backup", "json")
        with open(target, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        _trim_backups("postgres_backup")
        return {"success": True, "type": "postgres", "file": target}
    except Exception as e:
        log_error("backup_postgres", str(e))
        return {"success": False, "error": str(e)}

def run_daily_backup():
    try:
        return backup_postgres() if USE_POSTGRES else backup_sqlite()
    except Exception as e:
        log_error("run_daily_backup", str(e))
        return {"success": False, "error": str(e)}

def list_backups():
    try:
        files = []
        for filename in os.listdir(BACKUP_FOLDER):
            path = os.path.join(BACKUP_FOLDER, filename)
            if os.path.isfile(path):
                files.append({
                    "filename": filename,
                    "size": os.path.getsize(path),
                    "created_at": datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M:%S")
                })
        files.sort(key=lambda x: x["created_at"], reverse=True)
        return {"success": True, "files": files}
    except Exception as e:
        log_error("list_backups", str(e))
        return {"success": False, "files": []}


def verify_backup_file(filename):
    """Validate a backup file without restoring it. Used by the commercial smoke-check flow."""
    try:
        safe_name = os.path.basename(str(filename or ''))
        if not safe_name:
            return {"success": False, "error": "missing filename"}
        path = os.path.join(BACKUP_FOLDER, safe_name)
        if not os.path.isfile(path):
            return {"success": False, "error": "backup not found"}
        if safe_name.endswith('.json'):
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            table_counts = {k: len(v) for k, v in data.items() if isinstance(v, list)}
            required_any = any(k in table_counts for k in ("inventory", "orders", "master_orders", "warehouse_cells"))
            return {"success": bool(required_any), "type": "postgres_json", "filename": safe_name, "tables": table_counts, "error": "backup has no known tables" if not required_any else ""}
        if safe_name.endswith('.db'):
            return {"success": True, "type": "sqlite_db", "filename": safe_name, "size": os.path.getsize(path)}
        return {"success": False, "error": "unsupported backup type", "filename": safe_name}
    except Exception as e:
        log_error("verify_backup_file", str(e))
        return {"success": False, "error": str(e)}
