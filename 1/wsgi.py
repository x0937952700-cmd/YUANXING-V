# V46 real mainfile fixed lock: keep existing app entrypoint, no page/event logic changes.
"""
Render / Gunicorn entrypoint. V46 real mainfile fixed lock build.
This file exists so both of these start commands work:
  gunicorn wsgi:app --bind 0.0.0.0:$PORT
  gunicorn app:app --config gunicorn.conf.py
"""
from app import app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(__import__('os').environ.get('PORT', 5000)))
