"""Shipping preview, deduction and shipping-record helpers.

Mainfile-safe facade. Functions remain in app.py/db.py for compatibility; new work should attach through this service name.
"""

SERVICE_NAME = "shipping_service"

def marker():
    return SERVICE_NAME
