沅興木業 FIX53 正式底層乾淨版

已修正：
1. 徹底移除舊客戶明細 modal 流程，點客戶只會進左側客戶資料。
2. app.js 移除 FIX49/FIX51 舊覆蓋區塊，並加入 FIX53 最終防護層。
3. /api/customers 改用資料庫 GROUP BY 統計，減少北中南客戶列表等待。
4. /api/customer-items 改為 SQL 直接依 customer_uid/customer_name 篩選，不再整表抓回前端。
5. 客戶關聯持續以 customer_uid 優先，customer_name 只做舊資料備援。
6. PWA / base / service worker 版本統一為 fix53-production-clean。
7. 清除舊提示字與客戶 modal 殘留，降低手機舊畫面與卡頓。
8. smoke_test.py 更新，可做基本語法與關鍵流程檢查。

覆蓋方式：解壓後把所有檔案覆蓋 GitHub 專案根目錄，再到 Render Deploy。
