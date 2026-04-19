from flask import Blueprint, request, jsonify
from services.db import conn

inventory_api = Blueprint("inventory_api", __name__)

@inventory_api.route("/api/inventory/add", methods=["POST"])
def add():
    d=request.json
    db=conn();c=db.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS inventory(name TEXT PRIMARY KEY,qty INT)")
    c.execute("SELECT qty FROM inventory WHERE name=%s",(d["name"],))
    r=c.fetchone()
    if r:
        c.execute("UPDATE inventory SET qty=qty+%s WHERE name=%s",(d["qty"],d["name"]))
    else:
        c.execute("INSERT INTO inventory VALUES(%s,%s)",(d["name"],d["qty"]))
    db.commit()
    return jsonify(success=True)
