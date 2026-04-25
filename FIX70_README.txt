FIX70 最終衝突收斂版

本版從 FIX69 往上收斂，不刪功能，只處理仍可能造成按鈕重複觸發、舊資料衝突與手機端卡頓的問題。

修正重點：
1. 出貨客戶商品按鈕改成唯一最新路由：重新載入 / 加入選取商品 / 整個加入，不再被舊版 document click 重複觸發。
2. 倉庫圖格子內「插入格子 / 刪除格子」改成最優先攔截，舊版 +-、固定 20 格控制繼續完全退役。
3. 管理員封鎖、備份還原、封存客戶還原、今日異動刪除等動態按鈕改成唯一處理，不會同時跑 FIX68/FIX69 舊 handler。
4. loadCustomerBlocks / renderWarehouse / renderCustomers / loadShipCustomerItems66 / 今日異動 / 代辦 / 出貨查詢 / 設定資料載入全部加上最後一層 single-flight 收斂，降低返回與進功能頁卡頓。
5. 確認送出加最後一層單次鎖，避免連點或舊 handler 衝突造成重複送出。
6. 內建 yx70SmokeCheck，會掃描目前頁面 onclick / onsubmit 是否有缺函式，避免按鈕按下完全無反應。
7. PWA / base.html / service-worker 版本更新為 fix70-final-conflict-convergence，避免手機吃舊快取。
8. manifest 捷徑 URL 修正為實際路由 /inventory、/warehouse、/today-changes。

覆蓋方式：
整包解壓後直接覆蓋 GitHub 專案，Render 重新部署即可。
