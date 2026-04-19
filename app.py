
from flask import Flask, request, jsonify, session, redirect, render_template
import os, psycopg2, hashlib, time

app = Flask(__name__)
app.secret_key="pro"

def conn():
    return psycopg2.connect(os.environ.get("DATABASE_URL"))

def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

def init():
 db=conn();c=db.cursor()
 c.execute("CREATE TABLE IF NOT EXISTS users(u TEXT PRIMARY KEY,p TEXT)")
 c.execute("CREATE TABLE IF NOT EXISTS inventory(name TEXT PRIMARY KEY,qty INT,loc TEXT)")
 c.execute("CREATE TABLE IF NOT EXISTS ai_fix(w TEXT,c TEXT)")
 db.commit()
init()

@app.route("/")
def home():
 if "u" not in session: return redirect("/login")
 return render_template("home.html")

@app.route("/login")
def login(): return render_template("login.html")

@app.route("/api/login",methods=["POST"])
def l():
 d=request.json
 u=d["u"];p=hash_pw(d["p"])
 db=conn();c=db.cursor()
 c.execute("SELECT * FROM users WHERE u=%s",(u,))
 r=c.fetchone()
 if not r:
  c.execute("INSERT INTO users VALUES(%s,%s)",(u,p));db.commit()
  session["u"]=u; return jsonify(ok=1)
 if r[1]==p:
  session["u"]=u; return jsonify(ok=1)
 return jsonify(ok=0)

@app.route("/api/inv/add",methods=["POST"])
def add():
 d=request.json
 db=conn();c=db.cursor()
 c.execute("SELECT qty FROM inventory WHERE name=%s",(d["n"],))
 r=c.fetchone()
 if r: c.execute("UPDATE inventory SET qty=qty+%s WHERE name=%s",(d["q"],d["n"]))
 else: c.execute("INSERT INTO inventory VALUES(%s,%s,%s)",(d["n"],d["q"],""))
 db.commit(); return jsonify(ok=1)

@app.route("/api/inv/list")
def list():
 db=conn();c=db.cursor()
 c.execute("SELECT name,qty,COALESCE(loc,'') FROM inventory")
 return jsonify(d=c.fetchall())

@app.route("/api/inv/set",methods=["POST"])
def setloc():
 d=request.json
 db=conn();c=db.cursor()
 c.execute("UPDATE inventory SET loc=%s WHERE name=%s",(d["loc"],d["n"]))
 db.commit(); return jsonify(ok=1)

# OCR 3 engine stub
@app.route("/api/ocr",methods=["POST"])
def ocr():
 return jsonify(text="OCR結果 120x30=360",conf=75)

# AI
@app.route("/api/ai",methods=["POST"])
def ai():
 d=request.json
 db=conn();c=db.cursor()
 c.execute("INSERT INTO ai_fix VALUES(%s,%s)",(d["w"],d["c"]))
 db.commit(); return jsonify(ok=1)
