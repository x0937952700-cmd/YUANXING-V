
from flask import Blueprint,jsonify
from services.db import load
logs_api=Blueprint("logs_api",__name__)
@logs_api.route("/api/logs")
def logs():
    return jsonify(items=load()["logs"])
