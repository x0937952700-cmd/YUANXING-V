import os

# Render 會透過 PORT 環境變數指定服務埠。
# 這個檔案是為了相容目前 Render Start Command：
# gunicorn app:app --config gunicorn.conf.py
bind = f"0.0.0.0:{os.environ.get('PORT', '10000')}"
workers = int(os.environ.get('WEB_CONCURRENCY', '1'))
threads = int(os.environ.get('GUNICORN_THREADS', '2'))
timeout = int(os.environ.get('GUNICORN_TIMEOUT', '120'))
accesslog = '-'
errorlog = '-'
loglevel = os.environ.get('GUNICORN_LOG_LEVEL', 'info')
preload_app = False
