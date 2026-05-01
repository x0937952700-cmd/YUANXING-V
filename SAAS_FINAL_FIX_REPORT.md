# 沅興木業 最終 SaaS 商用版修復報告

本包以最新覆蓋包為底，補上商用穩定層，目標是：多人同時使用、出貨不重複扣、頁面不被舊版重複綁定拖慢。

## 已修復重點

1. **資料庫連線穩定化**
   - PostgreSQL 會自動讀 Render 的 `DATABASE_URL`。
   - 自動補 `sslmode=require`。
   - 使用連線池，避免高頻 API 開關連線造成卡頓。
   - 本機測試仍可用 SQLite；Render 可設定 `YX_ALLOW_SQLITE_FALLBACK=0` 強制只用 PostgreSQL。

2. **初始化不重複執行**
   - `init_db()` 已加上全域鎖與 `_INIT_DONE`。
   - 不會每次打開頁面都重複建表、補欄位、塞倉庫格。

3. **自動建表 / 補欄位 / 加索引**
   - users、customers、inventory、orders、master_orders、shipping_records、warehouse_cells、warehouse_items、audit_logs、activity_logs、todos、backups。
   - 自動補舊資料庫缺少欄位。
   - 加上 customer、product、created_at、warehouse cell 等索引，改善客戶商品、出貨紀錄、今日異動、倉庫查詢速度。

4. **多人同時出貨安全**
   - 出貨扣除改成單一 transaction。
   - PostgreSQL 使用 `SELECT ... FOR UPDATE` 鎖定商品列。
   - SQLite 使用 `BEGIN IMMEDIATE` 與程序鎖避免同時寫入亂扣。
   - 扣除順序固定：總單 → 訂單 → 庫存。
   - shipping_records 會記錄每個來源的 before / deducted / after。

5. **前端避免重複綁定**
   - `clean_ui_static.js` 加入全域硬鎖，避免舊版或重複載入造成按鈕被綁多次、畫面跳動、重複送出。
   - API fetch 使用 `no-store`，避免舊資料殘留。

## Render 必要設定

Environment Variables：

```text
DATABASE_URL = Render PostgreSQL 自動提供的 External/Internal Database URL
SECRET_KEY = 任意一組安全字串
YX_ALLOW_SQLITE_FALLBACK = 0
```

Start Command：

```text
gunicorn app:app
```

Build Command：

```text
pip install -r requirements.txt
```

## 覆蓋方式

直接把整包內容覆蓋 GitHub repository 根目錄。不要只覆蓋單一檔案，避免舊版 JS / CSS / app.py 留下來干擾。
