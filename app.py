from flask import Flask, render_template
from api.auth import auth_api

app = Flask(__name__)
app.register_blueprint(auth_api)

@app.route("/")
def login_page():
    return render_template("login.html")

@app.route("/home")
def home_page():
    return render_template("home.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
