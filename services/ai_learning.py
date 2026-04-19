
from services.db import load,save

def learn(wrong,correct):
    db=load()
    db["ai"][wrong]=correct
    save(db)
