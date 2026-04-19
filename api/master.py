
from flask import Blueprint, jsonify, request
master_api = Blueprint("master_api", __name__)

@master_api.route("/api/master", methods=["GET","POST"])
def master():
    return jsonify(success=True)
