from flask import Flask, render_template, jsonify
from api.auth import auth_api

app = Flask(__name__)
app.register_blueprint(auth_api)

@app.route("/")
def index():
    return render_template("login.html")

@app.route("/home")
def home():
    return render_template("home.html")

@app.errorhandler(500)
def handle_500(e):
    return jsonify({"msg": "Server Error"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
