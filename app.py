import os
import traceback
from flask import Flask, jsonify, request, Response

# Render 安全啟動殼：
# 先讓 Gunicorn 立即綁定 $PORT，避免完整 app 匯入或資料庫初始化太慢造成 Exited with status 1。
# 完整系統會在第一次非 health 請求時載入 yx_app_full.app。
os.environ.setdefault("YX_DISABLE_BACKGROUND_INIT", "1")
os.environ.setdefault("YX_AUTO_DAILY_BACKUP", "0")

_boot_app = Flask(__name__)
_boot_app.secret_key = os.getenv("SECRET_KEY", "yuanxing-render-boot")
_loaded_app = None
_load_error = None
_load_trace = None

def _load_full_app():
    global _loaded_app, _load_error, _load_trace
    if _loaded_app is not None:
        return _loaded_app
    try:
        from yx_app_full import app as full_app
        _loaded_app = full_app
        _load_error = None
        _load_trace = None
        return _loaded_app
    except Exception as exc:
        _load_error = str(exc)
        _load_trace = traceback.format_exc()
        return None

@_boot_app.route("/health")
@_boot_app.route("/api/health")
def health():
    return jsonify(
        success=True,
        status="ok",
        service="yuanxing",
        boot="safe",
        full_loaded=(_loaded_app is not None),
        load_error=_load_error or ""
    )

@_boot_app.route("/api/startup-error")
def startup_error():
    if _loaded_app is not None:
        return jsonify(success=True, message="完整系統已載入，沒有啟動錯誤")
    _load_full_app()
    return jsonify(success=(_loaded_app is not None), error=_load_error or "", trace=_load_trace or "")

@_boot_app.before_request
def lazy_load_before_request():
    if request.path in ("/health", "/api/health", "/api/startup-error"):
        return None
    full_app = _load_full_app()
    if full_app is None:
        html = f"""
        <html><head><meta charset='utf-8'><title>沅興木業啟動診斷</title></head>
        <body style='font-family:Arial,"Microsoft JhengHei",sans-serif;padding:24px;line-height:1.6'>
        <h2>沅興木業完整系統載入失敗</h2>
        <p>Render Port 已成功開啟，但完整 app 匯入時發生錯誤。</p>
        <p><b>錯誤：</b> {_load_error or ''}</p>
        <p>請開啟 <code>/api/startup-error</code> 查看完整 Traceback。</p>
        <pre style='white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px'>{_load_trace or ''}</pre>
        </body></html>
        """
        return Response(html, status=500, mimetype="text/html")
    return None

class _LazyApp:
    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path in ("/health", "/api/health", "/api/startup-error"):
            return _boot_app(environ, start_response)
        full_app = _load_full_app()
        if full_app is not None:
            return full_app(environ, start_response)
        return _boot_app(environ, start_response)

app = _LazyApp()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    _boot_app.run(host="0.0.0.0", port=port)
