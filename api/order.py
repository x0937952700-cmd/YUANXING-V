from flask import Blueprint, request, jsonify
from services.db import conn

order_api = Blueprint("order_api", __name__)

@order_api.route("/api/order", methods=["POST"])
def create():
    d=request.json
    db=conn();c=db.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS orders(product TEXT,qty INT)")
    c.execute("SELECT qty FROM inventory WHERE name=%s",(d["product"],))
    r=c.fetchone()
    if not r or r[0]<d["qty"]:
        return jsonify(success=False,error="庫存不足")
    c.execute("UPDATE inventory SET qty=qty-%s WHERE name=%s",(d["qty"],d["product"]))
    c.execute("INSERT INTO orders VALUES(%s,%s)",(d["product"],d["qty"]))
    db.commit()
    return jsonify(success=True)
