from db import execute, json_dumps, now_iso


def audit(username: str, action_type: str, entity_type: str, entity_key: str = '', before=None, after=None):
    execute('''INSERT INTO audit_trails(username,action_type,entity_type,entity_key,before_json,after_json,created_at)
               VALUES(?,?,?,?,?,?,?)''', (
        username or '', action_type, entity_type, str(entity_key or ''),
        json_dumps(before or {}), json_dumps(after or {}), now_iso()
    ))


def today(category: str, action: str, customer_name='', product_text='', qty=0, location='', source='', operator='', detail=None):
    execute('''INSERT INTO today_changes(category,action,customer_name,product_text,qty,location,source,operator,detail_json,is_read,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)''', (
        category, action, customer_name or '', product_text or '', int(qty or 0),
        location or '', source or '', operator or '', json_dumps(detail or {}), 0, now_iso()
    ))
