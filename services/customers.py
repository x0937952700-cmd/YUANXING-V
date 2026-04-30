from db import execute, fetch_one, fetch_all, new_uid, now_iso

VALID_REGIONS = {'北區', '中區', '南區'}


def ensure_customer(name: str, region: str = '北區', trade_type: str = '') -> dict | None:
    name = (name or '').strip()
    if not name:
        return None
    row = fetch_one('SELECT * FROM customer_profiles WHERE name=?', (name,))
    if row:
        return row
    if region not in VALID_REGIONS:
        region = '北區'
    uid = new_uid('CUST')
    t = now_iso()
    try:
        execute('''INSERT INTO customer_profiles(uid,name,region,trade_type,created_at,updated_at)
                   VALUES(?,?,?,?,?,?)''', (uid, name, region, trade_type or '', t, t))
    except Exception:
        # 防止多人同時新增同名客戶時因 UNIQUE(name) 直接 500。
        row = fetch_one('SELECT * FROM customer_profiles WHERE name=?', (name,))
        if row:
            return row
        raise
    return fetch_one('SELECT * FROM customer_profiles WHERE uid=?', (uid,))


def find_customer_by_uid_or_name(uid: str = '', name: str = '') -> dict | None:
    if uid:
        row = fetch_one('SELECT * FROM customer_profiles WHERE uid=?', (uid,))
        if row:
            return row
    name = (name or '').strip()
    if name:
        row = fetch_one('SELECT * FROM customer_profiles WHERE name=?', (name,))
        if row:
            return row
        alias = fetch_one('SELECT customer_uid FROM customer_aliases WHERE alias=?', (name,))
        if alias:
            return fetch_one('SELECT * FROM customer_profiles WHERE uid=?', (alias['customer_uid'],))
    return None


def customer_suggestions(q: str, limit: int = 10) -> list[dict]:
    q = (q or '').strip()
    try:
        limit = max(1, min(int(limit), 50))
    except Exception:
        limit = 10
    if not q:
        return fetch_all('SELECT * FROM customer_profiles WHERE is_archived=0 ORDER BY region,name LIMIT ?', (limit,))
    like = f'%{q}%'
    # 不使用 SELECT DISTINCT + ORDER BY CASE，避免 PostgreSQL 出現
    # "for SELECT DISTINCT, ORDER BY expressions must appear in select list"。
    rows = fetch_all('''SELECT c.*
                        FROM customer_profiles c
                        LEFT JOIN customer_aliases a ON a.customer_uid=c.uid
                        WHERE c.is_archived=0
                          AND (c.name LIKE ? OR c.common_materials LIKE ? OR c.common_sizes LIKE ? OR a.alias LIKE ?)
                        ORDER BY CASE WHEN c.name LIKE ? OR a.alias LIKE ? THEN 0 ELSE 1 END, c.region, c.name
                        LIMIT ?''', (like, like, like, like, f'{q}%', f'{q}%', limit * 3))
    seen = set()
    out = []
    for row in rows:
        uid = row.get('uid') or row.get('name')
        if uid in seen:
            continue
        seen.add(uid)
        out.append(row)
        if len(out) >= limit:
            break
    return out
