# FIX104：Render 端口穩定設定
# 即使 Render 後台 Start Command 只填 `gunicorn app:app`，Gunicorn 也會讀取本檔，
# 強制綁定到 Render 提供的 PORT，避免 No open ports detected。
import os

bind = "0.0.0.0:" + os.environ.get("PORT", "10000")
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "120"))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "5"))
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "info")
accesslog = "-"
errorlog = "-"
