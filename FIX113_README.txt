沅興木業 FIX113｜FIX63～FIX102 舊函式總收斂・最新母版

本版目的：把 FIX63～FIX102 之間累積的舊版補丁與重複函式收斂成單一最新母版，避免返回主頁、點功能頁、今日異動頁面被舊函式重複渲染。

已完成：
1. static/app.js 已由 11,000+ 行壓縮收斂為單一核心檔案，移除 FIX63～FIX102 舊版補丁區塊。
2. 今日異動只保留新版直列卡片。
3. 今日異動開頁不自動抓未入倉、不自動重算未入倉。
4. 只有按右上「刷新」才會抓 /api/today-changes?refresh=1&include_unplaced=1。
5. 全頁 MutationObserver 舊邏輯已阻擋，避免 body/html 一變動就整頁重畫。
6. 舊版 pageshow / timer / interval 造成的返回主頁卡頓已收斂。
7. 商品卡片清掉混進商品文字的「編輯 / 直接出貨 / 刪除 / 未填材質」。
8. 倉庫圖、出貨查詢、設定頁必要函式保留並接到 FIX113 單一母版。
9. 快取版本更新為 fix113-consolidated-latest-master，PWA 會清掉舊快取。
10. 舊 FIX63～FIX102 README 已移除，只保留本 FIX113 說明，避免版本混亂。

檢查項目：
- node --check static/app.js
- python3 -S -m py_compile app.py db.py ocr.py backup.py tools/smoke_test.py
- python3 -S tools/smoke_test.py
- ZIP 完整性測試
