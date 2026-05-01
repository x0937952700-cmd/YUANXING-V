# 沅興木業最終修復版

本包已針對上一版常見錯誤做完整修復：

- 修復 PostgreSQL / SQLite SQL 語法相容問題
- 修復 orders / master_orders 缺 quantity 欄位造成 API 500
- 修復出貨扣除時 SELECT quantity 造成訂單/總單爆錯
- 修復北中南客戶區 SQL 空字串語法錯誤
- 修復 customer-items 在訂單/總單查詢會失敗的問題
- 修復直接出貨後同步扣減 qty/quantity
- 修復 100x30x63=504x5+... 指定案例件數為 10 件
- 修復前端 onclick 字串含特殊符號導致按鈕失效
- 補上 API 統一錯誤回傳，避免前端只顯示空白
- 全頁面與主要 API 已用 Flask test client 跑過基本開啟測試

Render 必要設定：

- DATABASE_URL：Render PostgreSQL 提供的資料庫網址
- 建議 PYTHON_VERSION：3.11.10
- Start Command：gunicorn app:app

