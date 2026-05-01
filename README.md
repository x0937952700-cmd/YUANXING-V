# 沅興木業 最終資料庫完整橋接版

這包可直接覆蓋 GitHub 並部署到 Render。

## Render 必設環境變數

- `DATABASE_URL`：Render PostgreSQL 內部連線字串
- `SECRET_KEY`：可由 Render 自動產生
- `PYTHON_VERSION=3.11.11`

## 已接上的資料表

- users
- customers
- inventory
- orders
- master_orders
- shipping_records
- warehouse_cells
- warehouse_items
- audit_logs
- activity_logs
- todos
- backups

## 已接上的主要 API

- `/api/db-check`
- `/api/submit/inventory`
- `/api/submit/orders`
- `/api/submit/master_order`
- `/api/submit/ship`
- `/api/inventory`
- `/api/orders`
- `/api/master-orders`
- `/api/customers`
- `/api/customer-items`
- `/api/warehouse`
- `/api/shipping-records`
- `/api/today`
- `/api/audit-trails`
- `/api/admin/users`
- `/api/backups`
- `/api/todos`

## 穩定性處理

- 不再寫死 PostgreSQL 網址
- Render 自動補 `sslmode=require`
- 本機可 SQLite fallback，Render 可用 `DATABASE_URL` 直接同步
- 每次啟動自動建表與補欄位
- 首次請求才初始化 DB，避免首頁啟動卡死
- 前端按鈕已接到資料庫 API，不再只顯示「功能尚未接入」
