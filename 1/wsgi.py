"""Render/Gunicorn entrypoint for 沅興木業 V111.
Fast import: app.py does not run heavy DB migration before binding PORT.
"""
from app import app

if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
