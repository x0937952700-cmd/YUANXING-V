# Render 500 修復報告

## 目前錯誤
Render log 顯示：

`psycopg2.errors.InvalidColumnReference: there is no unique or exclusion constraint matching the ON CONFLICT specification`

原因是舊資料庫裡的 `warehouse_cells` 表已經存在，但沒有真正建立：

`UNIQUE(zone, band, row_name, slot)`

PostgreSQL 的 `ON CONFLICT(zone, band, row_name, slot)` 必須要有對應 unique constraint / unique index，否則首頁初始化會直接 500。

## 已修復
- `seed_warehouse_cells()` 不再依賴 `ON CONFLICT`
- 改成 `WHERE NOT EXISTS`，PostgreSQL / SQLite 都可用
- 啟動時會先清掉重複 warehouse cell
- 再補 `ux_warehouse_cells_position` 唯一索引
- 保留原本 A/B 倉、6 段、front/back、1~10 格架構

## Render Start Command
你現在使用的可以保留：

`gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120`

## Environment
保留：

`YX_ALLOW_SQLITE_FALLBACK=0`

DATABASE_URL 要用 Render PostgreSQL 的 External/Internal connection string 都可以；本包會自動補 `sslmode=require`。
