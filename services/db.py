
import json, os, time
DB="data/db.json"
def load():
    if not os.path.exists(DB):
        return {"users":{},"inventory":{},"orders":[],"master":{},"logs":[],"warehouse":{},"ai":{}}
    return json.load(open(DB))
def save(d):
    json.dump(d, open(DB,"w"))
def log(user,action):
    d=load()
    d["logs"].append({"user":user,"action":action,"time":time.strftime("%Y-%m-%d %H:%M")})
    save(d)
