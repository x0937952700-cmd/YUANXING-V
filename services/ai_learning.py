
from services.db import load, save
def learn(wrong,correct):
    d=load()
    d["ai"][wrong]=correct
    save(d)
