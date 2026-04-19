
from flask import Blueprint, jsonify, request
logs_api = Blueprint("logs_api", __name__)

@logs_api.route("/api/logs", methods=["GET","POST"])
def logs():
    return jsonify(success=True)
