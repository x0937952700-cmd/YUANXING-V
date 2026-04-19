
from flask import Flask, render_template, request, jsonify
import json, os

app = Flask(__name__)
DATA="data.json"

def load():
    if not os.path.exists(DATA):
        return {"warehouse":{}, "inventory":{}}
    return json.load(open(DATA))

def save(d):
    json.dump(d, open(DATA,"w"))

@app.route("/")
def home():
    return render_template("home.html")

@app.route("/warehouse")
def wh():
    return render_template("warehouse.html")

@app.route("/api/load")
def api_load():
    return jsonify(load())

@app.route("/api/save",methods=["POST"])
def api_save():
    d=request.json
    save(d)
    return jsonify(success=True)

@app.route("/api/add_inventory",methods=["POST"])
def add_inv():
    d=request.json
    data=load()
    name=d["name"]
    data["inventory"][name]=data["inventory"].get(name,0)+1
    save(data)
    return jsonify(success=True)

@app.route("/api/find")
def find():
    name=request.args.get("name")
    data=load()
    result=[]
    for k,v in data["warehouse"].items():
        if any(name in x for x in v):
            result.append(k)
    return jsonify(cells=result)

@app.route("/api/ocr",methods=["POST"])
def ocr():
    return jsonify(text="測試商品")
