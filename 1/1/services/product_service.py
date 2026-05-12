"""Product list, sorting, snapshots and transfer-facing helpers.

Mainfile-safe facade. Functions remain in app.py/db.py for compatibility; new work should attach through this service name.
"""

SERVICE_NAME = "product_service"

def marker():
    return SERVICE_NAME
