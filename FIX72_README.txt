FIX72 一張表＋倉庫長按＋客戶資料錯誤修復版

本版只針對使用者指定問題收斂，不刪減既有功能：
1. 庫存 / 訂單 / 總單改為單一主表格式：材質、尺寸、支數 x 件數、數量。
2. 保留批量加材質、批量刪除、搜尋、全選、清除選取、只看已選。
3. 點尺寸即可選取，不顯示舊勾選框；選取後可用「只看已選」做進一步篩選。
4. 移除舊版重複表格、卡片表與多餘列表，只保留一張主表承接功能。
5. 倉庫圖取消格內「插入格子 / 刪除格子」兩顆按鈕，改成長按格子開啟操作選單。
6. 修正客戶資料頁 window.fillCustomerForm is not a function。
7. 更新 PWA / 靜態檔版本為 fix72-table-longpress-customer-repair，避免手機吃舊快取。

檢查：
- static/app.js 語法檢查通過
- app.py / db.py / backup.py / ocr.py 編譯通過
- tools/smoke_test.py 通過
