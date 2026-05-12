"""Render/Gunicorn entrypoint for 沅興木業.
Fast import: app.py does not run blocking database work before binding PORT.
"""
from app import app

if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))

# V125 mobile zoom: server entrypoint unchanged; layout is served through main templates/static files.

# V147 soft-cache degraded-speed pack: keep deployment config on mainline.
