from flask import Blueprint, request, jsonify
import psycopg2, os

master_api = Blueprint("master_api", __name__)

def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))

@master_api.route("/api/master/add", methods=["POST"])
def add():
    d=request.json
    db=conn();c=db.cursor()

    c.execute("CREATE TABLE IF NOT EXISTS master(customer TEXT,product TEXT,qty INT)")
    c.execute("SELECT qty FROM master WHERE customer=%s AND product=%s",(d["customer"],d["product"]))
    r=c.fetchone()

    if r:
        c.execute("UPDATE master SET qty=qty+%s WHERE customer=%s AND product=%s",(d["qty"],d["customer"],d["product"]))
    else:
        c.execute("INSERT INTO master VALUES(%s,%s,%s)",(d["customer"],d["product"],d["qty"]))

    db.commit()
    return jsonify(success=True)
