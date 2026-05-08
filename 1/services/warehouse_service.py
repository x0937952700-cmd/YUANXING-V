"""Warehouse cell, slot, drag, available-item and display-summary helpers.

Mainfile-safe facade. Functions remain in app.py/db.py for compatibility; new work should attach through this service name.
"""

SERVICE_NAME = "warehouse_service"

def marker():
    return SERVICE_NAME
