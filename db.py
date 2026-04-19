
# 🔥 覆寫版 db_patch.py（補齊缺失 function）

def apply_db_patch():
    global get_corrections, save_correction, log_error, log_action

    def get_corrections():
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT wrong, correct FROM corrections")
            rows = cur.fetchall()
            conn.close()
            return {r[0]: r[1] for r in rows} if rows else {}
        except:
            return {}

    def save_correction(wrong, correct):
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("INSERT INTO corrections(wrong, correct) VALUES (%s, %s)", (wrong, correct))
            conn.commit()
            conn.close()
        except:
            pass

    def log_error(src, msg):
        print(f"[ERROR] {src} -> {msg}")

    def log_action(user, action):
        print(f"[LOG] {user} -> {action}")
