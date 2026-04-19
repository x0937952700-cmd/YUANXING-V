
from flask import Blueprint, jsonify, request
warehouse_api = Blueprint("warehouse_api", __name__)

@warehouse_api.route("/api/warehouse", methods=["GET","POST"])
def warehouse():
    return jsonify(success=True)
