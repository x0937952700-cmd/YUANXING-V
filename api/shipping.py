from flask import Blueprint, request, jsonify
from services.db import conn

shipping_api = Blueprint("shipping_api", __name__)

@shipping_api.route("/api/shipping", methods=["POST"])
def ship():
    d=request.json
    db=conn();c=db.cursor()
    try:
        c.execute("SELECT qty FROM inventory WHERE name=%s FOR UPDATE",(d["product"],))
        i=c.fetchone()
        if not i or i[0]<d["qty"]:
            raise Exception("庫存不足")
        c.execute("UPDATE inventory SET qty=qty-%s WHERE name=%s",(d["qty"],d["product"]))
        db.commit()
        return jsonify(success=True)
    except Exception as e:
        db.rollback()
        return jsonify(success=False,error=str(e))
