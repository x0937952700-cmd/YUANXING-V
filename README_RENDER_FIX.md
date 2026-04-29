# 沅興木業 Commercial V10 Render 500 Safe

這版修正 Render 顯示 live 但瀏覽器 GET / 出現 Internal Server Error 的風險。

重點：
- HEAD / 回 200 只做健康檢查，不代表頁面渲染成功。
- HTML 頁面也會做輕量 DB schema guard，避免舊 session 查 users 表時 500。
- API 初始化失敗會回 JSON 錯誤，不回 Flask 原始錯誤頁。
- HTML 錯誤會顯示沅興木業錯誤卡與 /healthz，不再只顯示 Internal Server Error。
- 版本：YUANXING_COMMERCIAL_V10_RENDER_500_SAFE_LOCKED。

Render Start Command：

gunicorn app:app --config gunicorn.conf.py
