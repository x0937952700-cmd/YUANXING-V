
from flask import Flask, request, jsonify, session, redirect, render_template
import os, psycopg2, hashlib, base64
from google.cloud import vision

app = Flask(__name__)
app.secret_key = "final-pro"

def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))

def hash_pw(p):
    return hashlib.sha256(p.encode()).hexdigest()

def init_db():
    db=conn();c=db.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,password TEXT)")
    db.commit()

init_db()

# ---------- LOGIN ----------
@app.route("/")
def home():
    if "user" not in session:
        return redirect("/login")
    return render_template("home.html")

@app.route("/login")
def login():
    return render_template("login.html")

@app.route("/api/login",methods=["POST"])
def api_login():
    d=request.json
    u=d["username"]
    p=hash_pw(d["password"])

    db=conn();c=db.cursor()
    c.execute("SELECT password FROM users WHERE username=%s",(u,))
    r=c.fetchone()

    if not r:
        c.execute("INSERT INTO users VALUES(%s,%s)",(u,p))
        db.commit()
        session["user"]=u
        return jsonify(success=True)

    if r[0]==p:
        session["user"]=u
        return jsonify(success=True)

    return jsonify(success=False)

# ---------- GOOGLE OCR ----------
@app.route("/api/ocr", methods=["POST"])
def ocr():
    file = request.files["file"]
    content = file.read()

    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=content)

    response = client.text_detection(image=image)
    texts = response.text_annotations

    if not texts:
        return jsonify(text="", confidence=0)

    return jsonify(text=texts[0].description, confidence=90)
