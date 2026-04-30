import os

bind = "0.0.0.0:" + os.environ.get("PORT", "10000")
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "120"))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "5"))
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
accesslog = "-"
errorlog = "-"
