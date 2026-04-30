# Browser Safe Render Fix

已修復瀏覽器 `RESULT_CODE_KILLED_BAD_MESSAGE` 常見來源：

- 移除前端 `/socket.io/socket.io.js` 強制載入。
- 停用 Service Worker 註冊並自動清除舊快取。
- `static/sw.js` 改成立即 unregister，不再攔截 fetch。
- SocketIO server emit 加 try/except，不影響主要流程。
- 保留 Render 穩定啟動：`gunicorn -w 1 --threads 8 app:app`。

部署後若瀏覽器仍顯示舊錯誤，請強制重新整理或清除該網站資料一次。
