FIX71 一張表收斂 / 倉庫長按 / 客戶資料函式修復版

本版從 FIX70 往上修，保留功能，不重構：

1. 庫存 / 訂單 / 總單收斂為同一種表格格式：材質、尺寸、支數 x 件數、數量；客戶商品表另顯示來源。
2. 舊版多餘摘要表、卡片表、重複客戶商品表不再顯示，只保留 FIX71 一張表。
3. 表格保留批量功能：全選、清除選取、只看已選、搜尋、批量加材質、批量刪除、重新整理。
4. 點尺寸即可選取，不顯示選取框；選取後可用來批量處理或只看已選。
5. 手機端表格直接看到：材質（綠色字體）、尺寸、支數 x 件數，不需要左右滑。
6. 倉庫圖格子內的「插入格子 / 刪除格子」兩個按鈕已隱藏；改成長按格子叫出插入 / 刪除操作。
7. 修正客戶資料頁錯誤：window.fillCustomerForm is not a function。
8. PWA / base.html / service-worker 版本更新為 fix71-one-table-longpress-customer-repair，避免手機吃舊快取。

檢查：
- app.js node --check 通過
- app.py / db.py / ocr.py / backup.py py_compile 通過
- smoke_test 通過
