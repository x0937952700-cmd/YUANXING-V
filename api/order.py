
from flask import Blueprint, jsonify, request
order_api = Blueprint("order_api", __name__)

@order_api.route("/api/order", methods=["GET","POST"])
def order():
    return jsonify(success=True)
