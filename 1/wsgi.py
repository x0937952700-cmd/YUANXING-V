"""V131 Render/Gunicorn entrypoint.
Fast boot rule: never run heavy DB initialization while Gunicorn is importing the app,
otherwise Render cannot detect an open port and deploy fails with "No open ports detected".
"""
import os

# Default fast boot. Set YX_STARTUP_DB_INIT=sync only when debugging locally.
os.environ.setdefault("YX_STARTUP_DB_INIT", "skip")
os.environ.setdefault("YX_STARTUP_DB_CHECK", "0")

from app import app  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port)
