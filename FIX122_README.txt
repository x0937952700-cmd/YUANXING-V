FIX122 客戶/商品救援 + 母版安全接管

本包重點：
1. 不刪資料、不覆蓋既有功能。
2. 從目前資料庫的 inventory / orders / master_orders / shipping_records 掃描仍存在的 customer_name。
3. 若 customer_profiles 裡缺少該客戶，會自動補回客戶檔，預設放北區。
4. 若商品列的 customer_uid 空白或跟同名客戶不一致，會重新對齊 UID。
5. 客戶商品查詢改成 UID 或同名都會撈，避免 109 舊資料因 UID 不一致看起來像商品丟失。
6. 新增手動救援 API：GET/POST /api/recover/customers-from-relations。
7. 客戶清單載入時也會安全自動救援一次。

注意：
- FIX109 ZIP 本身沒有包含 warehouse.db 或 PostgreSQL 匯出資料，所以不能從 ZIP 檔案本身變出已被真正刪掉的資料。
- 如果商品/客戶資料仍在資料庫的舊表或關聯表，本包可以把它們重新顯示/補回客戶檔。
- 如果 Render PostgreSQL 已被清空，需要再用 Render 備份、舊 warehouse.db、或之前下載的備份 JSON/DB 還原。
