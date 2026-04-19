
from flask import Flask, render_template
from api.routes import api

app = Flask(__name__)
app.secret_key = "saas-final"

app.register_blueprint(api)

@app.route("/")
def home(): return render_template("home.html")

@app.route("/inventory")
def inventory(): return render_template("inventory.html")

@app.route("/orders")
def orders(): return render_template("orders.html")

@app.route("/warehouse")
def warehouse(): return render_template("warehouse.html")

@app.route("/shipping")
def shipping(): return render_template("shipping.html")

@app.route("/records")
def records(): return render_template("records.html")

if __name__ == "__main__":
    app.run()
