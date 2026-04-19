def init_db():
    conn = get_db()
    cur = conn.cursor()

    # 🔥🔥🔥 自動修復舊版 warehouse_cells（關鍵）
    try:
        cur.execute("SELECT zone FROM warehouse_cells LIMIT 1")
    except Exception:
        try:
            cur.execute("DROP TABLE warehouse_cells")
            conn.commit()
            print("🔥 已自動重建 warehouse_cells（舊版結構已清除）")
        except Exception as e:
            print("⚠️ 清除舊表失敗:", e)

    pk = "SERIAL PRIMARY KEY" if USE_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"
    text = "TEXT"

    tables = [
        f"""CREATE TABLE IF NOT EXISTS users (
            id {pk},
            username {text} UNIQUE NOT NULL,
            password {text} NOT NULL,
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS customer_profiles (
            id {pk},
            name {text} UNIQUE NOT NULL,
            phone {text},
            address {text},
            notes {text},
            region {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS inventory (
            id {pk},
            product_text {text} NOT NULL,
            product_code {text},
            qty INTEGER DEFAULT 0,
            location {text},
            customer_name {text},
            operator {text},
            source_text {text},
            created_at {text},
            updated_at {text}
        )""",
        f"""CREATE TABLE IF NOT EXISTS warehouse_cells (
            id {pk},
            zone {text} NOT NULL,
            column_index INTEGER NOT NULL,
            slot_type {text} NOT NULL,
            slot_number INTEGER NOT NULL,
            items_json {text},
            note {text},
            updated_at {text},
            UNIQUE(zone, column_index, slot_type, slot_number)
        )""",
    ]

    for t in tables:
        cur.execute(t)

    # 🔥 初始化倉庫格位
    for zone in ("A", "B"):
        for col in range(1, 13):
            for slot_type in ("front", "back"):
                for num in range(1, 11):
                    if USE_POSTGRES:
                        cur.execute("""
                            INSERT INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (zone, column_index, slot_type, slot_number) DO NOTHING
                        """, (zone, col, slot_type, num, "[]", "", now()))
                    else:
                        cur.execute("""
                            INSERT OR IGNORE INTO warehouse_cells(zone, column_index, slot_type, slot_number, items_json, note, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (zone, col, slot_type, num, "[]", "", now()))

    conn.commit()
    conn.close()