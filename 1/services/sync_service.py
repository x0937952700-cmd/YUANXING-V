"""Cache, PWA, SSE/incremental sync and background-save helpers.

Mainfile-safe facade. Functions remain in app.py/db.py for compatibility; new work should attach through this service name.
"""

SERVICE_NAME = "sync_service"

def marker():
    return SERVICE_NAME
