
from flask import Flask,render_template
from api.auth import auth_api
from api.inventory import inventory_api
from api.order import order_api
from api.master import master_api
from api.shipping import shipping_api
from api.ocr import ocr_api
from api.logs import logs_api
from api.warehouse import warehouse_api

app=Flask(__name__)
app.secret_key="final"

app.register_blueprint(auth_api)
app.register_blueprint(inventory_api)
app.register_blueprint(order_api)
app.register_blueprint(master_api)
app.register_blueprint(shipping_api)
app.register_blueprint(ocr_api)
app.register_blueprint(logs_api)
app.register_blueprint(warehouse_api)

@app.route("/")
def home(): return render_template("home.html")
@app.route("/login")
def login(): return render_template("login.html")
@app.route("/warehouse")
def wh(): return render_template("warehouse.html")
@app.route("/shipping_records")
def sr(): return render_template("shipping_records.html")

if __name__=="__main__":
    app.run()
