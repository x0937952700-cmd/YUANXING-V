FIX65 duplicate convergence

本版只收斂重複初始化 / 重複載入 / 重複渲染問題，不刪除原有功能。

處理項目：
1. 舊版多段 DOMContentLoaded 初始化已加上跳過閘門，避免同一頁同時跑多次倉庫圖 / 客戶區塊初始化。
2. loadCustomerBlocks、renderWarehouse、loadInventory、loadOrdersList、loadMasterList 加上 single-flight，短時間內重複呼叫會合併成一次。
3. 客戶卡片、商品表格、卡片列表加上 DOM 去重，避免同一筆畫面重複出現。
4. confirmSubmit 加上單次送出鎖，避免連點造成重複送出。
5. 返回 / 進功能頁時暫停重動畫，減少手機卡頓。
6. 手機表格維持尺寸 / 支數x件數 / 數量三欄直接可見，選取框保持隱藏，點尺寸選取。
