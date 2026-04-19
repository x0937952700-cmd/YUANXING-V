
from flask import Blueprint, jsonify, request
shipping_api = Blueprint("shipping_api", __name__)

@shipping_api.route("/api/shipping", methods=["GET","POST"])
def shipping():
    return jsonify(success=True)
