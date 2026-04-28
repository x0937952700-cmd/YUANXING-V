FIX123 淺灰金邊圓型標籤 + 母版接管收斂版

本包基於 FIX122，不刪除既有功能，保留 109 客戶/商品救援邏輯，並做以下修正：

1. 全站版本號改為 fix123-ornate-gray-master-hardlock。
   - base.html、service-worker.js、pwa.js、manifest.webmanifest 已同步。
   - PWA / 手機快取會換新 cache name，避免繼續吃 FIX121/FIX122 舊畫面。

2. 母版載入順序調整。
   - 先載 core_hardlock.js。
   - 再載 app.js 當相容功能庫。
   - 最後由 today / warehouse / customer / product / ship / legacy isolation 等新版母版硬鎖接管畫面。

3. 109 客戶/商品救援保留，但降低卡頓。
   - get_customers 不再每次開頁都掃 inventory / orders / master_orders / shipping_records。
   - 改成每個伺服器行程最多自動救援一次。
   - 需要手動重跑時仍可呼叫 /api/recover/customers-from-relations。

4. 主頁黑色標籤改成淺灰色金邊圓型標籤。
   - 庫存、訂單、總單、出貨、出貨查詢、倉庫圖、客戶資料、代辦事項已套用。
   - 設定 / 今日異動 / 使用者標籤同步改成淺灰金邊圓型。

5. 全站按鈕套用同一套淺灰金邊圓型標籤外觀。
   - primary / ghost / back / chip / pill / small / tiny / icon / PWA 安裝按鈕都覆蓋成新版。
   - 只改 CSS 外觀，不改 onclick、API、資料庫邏輯。

已檢查：
- Python py_compile OK
- tools/smoke_test.py OK
- node --check 主要 JS 模組 OK
