# 00_CHATGPT_MUST_READ_BEFORE_REPAIR

這份檔案是給下一次 ChatGPT / AI 修復本專案時必讀的指令。  
**修復前一定要先讀這份檔案，不准跳過。**

---

## 一、最高原則

1. **從使用者最新上傳的 ZIP / 最新主檔開始修。**  
   不要拿舊版當基礎，不要把舊補丁覆蓋回來。

2. **只修使用者當次指定的壞掉功能。**  
   不要順手重構、不要順手換 UI、不要新增使用者沒要求的功能。

3. **不要改壞已經正常的功能。**  
   每次修之前先確認相關頁面目前資料來源、事件、renderer、快取路徑，再動手。

4. **不要修完又說還要收斂。**  
   如果要改資料主線、快取、renderer，必須一次把相關檔案對齊，不准只改一半。

5. **不能讓舊版覆蓋新版。**  
   不准重新載入舊補丁、舊 hardlock、舊 overlay、舊 renderer。

---

## 二、絕對不能亂動的核心架構

除非使用者明確要求，以下檔案或規則不能改壞：

- `static/yx_cache.js`
- `static/yx_core.js`
- `STATIC_VERSION` 的版本更新可以改，但不能讓舊靜態檔繼續覆蓋新版
- service worker **不准快取 `/api/`**
- API timeout / fast cache / background save queue 不能刪
- `YXDataStore` 資料主線不能被繞過
- `YXMutationBus` 寫入一致性不能被繞過
- `YXDeviceSync` 同步資料不能被單頁清空

禁止新增：

- `setInterval`
- `MutationObserver`
- 重複 renderer
- 重複 click 綁定
- overlay / hardlock 補丁檔
- 舊版 `yx_v452_max_repair.js` 類型補丁回掛

---

## 三、修復資料顯示問題時的鐵規則

1. **有本機同步資料時，頁面必須先顯示本機資料。**  
   不准先等 DB，不准讓 API timeout 後變空白。

2. **API 回空、timeout、錯誤時，不准洗掉已有畫面。**  
   只有以下情況可以清空資料：
   - 使用者明確刪除
   - 後端成功回傳 authoritative full sync，且狀態明確 ok

3. **訂單 / 總單的客戶件數、筆數只能從目前 rows 計算。**  
   不准再用 `/api/customers` 舊統計覆蓋。

4. **今日異動的未錄入倉庫圖要跟 `warehouse_available` 同源。**  
   不能一邊有未錄入商品，另一邊今日異動顯示 0。

5. **出貨頁客戶與商品要從 orders + master_orders + inventory 同步資料先組出。**  
   不准背景 API 回空後把北中南客戶或商品清掉。

6. **倉庫圖與未錄入倉庫圖要用同一套唯一商品 key。**  
   已入倉的商品不能再出現在未錄入清單；從格子刪掉才回到未錄入。

---

## 四、修復時一定要改「實際載入的主檔」

不要只寫新補丁。要確認 `templates/base.html` 或頁面模板實際載入哪支 JS / CSS。

常見主檔：

- `templates/base.html`
- `templates/*.html`
- `static/yx_data_store.js`
- `static/yx_mutation_bus.js`
- `static/yx_device_sync.js`
- `static/yx_regression_guard.js`
- `static/yx_pages/inventory_page.js`
- `static/yx_pages/product_page_core.js`
- `static/yx_pages/shipping_page.js`
- `static/yx_pages/warehouse_page.js`
- `static/yx_pages/today_changes_page.js`
- `app.py`
- `db.py`
- `wsgi.py`
- `requirements.txt`
- `render.yaml`
- `Procfile`

---

## 五、每次修改前要先做的檢查

1. 解壓最新 ZIP。
2. 檢查 `templates/base.html` 的載入順序。
3. 搜尋是否有舊補丁或舊 renderer 殘留：
   - `yx_v452_max_repair`
   - `hardlock`
   - `overlay`
   - `renderWarehouseLegacy`
   - 重複 `renderTodayChanges`
4. 搜尋是否有直接繞過資料主線：
   - `fetch(`
   - `force=1`
   - `force:true`
   - 直接讀 `localStorage` / `YX.cache` 後覆蓋畫面
5. 確認要修的功能牽涉哪些頁面，不要只改單一檔案。

---

## 六、每次修改後必跑檢查

至少跑：

```bash
python -m py_compile app.py db.py wsgi.py backup.py ocr.py
python scripts/static_data_spine_audit.py
python scripts/data_flow_regression_audit.py
python scripts/functional_path_audit.py
python scripts/regression_guard_audit.py
python scripts/predeploy_audit.py
```

如果有 Node.js，所有 JS 都要做語法檢查：

```bash
node --check static/yx_data_store.js
node --check static/yx_mutation_bus.js
node --check static/yx_device_sync.js
node --check static/yx_regression_guard.js
node --check static/yx_pages/inventory_page.js
node --check static/yx_pages/product_page_core.js
node --check static/yx_pages/shipping_page.js
node --check static/yx_pages/warehouse_page.js
node --check static/yx_pages/today_changes_page.js
```

ZIP 要檢查：

```bash
python -m zipfile -t 你的輸出檔.zip
```

---

## 七、回覆使用者時的規則

1. 不要說「確定 100% 修好」，除非真的做過對應檢查。
2. 要說清楚改了哪些檔案、修了哪些點。
3. 如果還有下一包，直接說「還有下一包」。
4. 如果沒有真的改檔，不要假裝已經修好。
5. 不要用一堆空泛說法，要提供可下載 ZIP。
6. 如果發現前一包有漏，要直接承認，不要硬凹。

---

## 八、本專案使用者最在意的不可回歸項目

修任何東西都不能讓以下功能壞掉：

- 同步完成後，庫存 / 訂單 / 總單 / 出貨 / 今日異動 / 倉庫圖要能立刻顯示本機同步資料
- 上次同步時間重新整理後仍顯示
- 今日異動不能空，未錄入倉庫圖要跟倉庫圖一致
- 訂單 / 總單新增後，北中南客戶名稱、件數、筆數要立刻顯示
- 訂單 / 總單刪除後，件數、筆數要立刻更新
- 出貨北中南客戶和商品不能消失
- 出貨預覽按確認不能像沒反應
- 倉庫圖不能逾時後變空白
- 倉庫圖商品不能重複顯示在錯格
- 倉庫圖長按選單要能關閉
- 不准舊版覆蓋新版造成頁面亂跳

---

## 九、下一次修復建議指令模板

使用者可以直接貼這段：

```text
從最新主檔開始修。先讀 00_CHATGPT_MUST_READ_BEFORE_REPAIR.md。
保留 yx_cache.js、yx_core.js、STATIC_VERSION、API timeout、背景保存 queue、fast cache、service worker 不快取 API。
只修我指定功能，不新增 renderer，不新增 setInterval，不新增 MutationObserver，不重複綁 click。
所有修改要直接寫進實際載入主檔，不要新增 overlay/hardlock 補丁，不要讓舊版覆蓋新版。
修完要跑 static_data_spine_audit、data_flow_regression_audit、functional_path_audit、regression_guard_audit、predeploy_audit，並檢查 JS/Python 語法和 ZIP 完整性。
如果還沒完全對齊，直接跟我說還有下一包，不要假裝完成。
```


## V485 追加硬規則：只改使用者指定的圖與位置
- 使用者說「圖一」「圖二」「圖三」時，只能修改該圖對應位置，不可擅自把其他頁、其他區塊、其他按鈕一起刪除或隱藏。
- 不准因為要求刪除某一張圖的按鈕，就全域刪除庫存 / 訂單 / 總單 / 出貨 / 倉庫圖的同名按鈕。
- 修復前必須先確認：該按鈕在哪個頁面、哪個容器、哪個 selector；修復只限那個 selector。
- 修完必須檢查：庫存、訂單、總單、出貨、倉庫圖原本正常按鈕仍存在。
- 診斷報告若顯示正常，但使用者實測失敗，必須以使用者實測流程為準，補強診斷規則，不能只說報告正常。

## V486 追加硬規則：診斷不能只看 API 200
- 診斷若近期錯誤紀錄中有 `api.fetch_failed`、`api.slow_or_error`、`statement timeout`、`SSL connection has been closed unexpectedly`、`unhandledrejection`、`regression_guard`，就必須在「主要異常清單」明確列出。
- 不准因為 `/api/health` 或 `/api/diagnostics/summary` 回 200 就顯示「沒有主要異常」。
- 診斷必須同時檢查：本機錯誤、伺服器 recent_errors、必要 API route、核心按鈕/事件對應、資料保存主線。
- 診斷不應自動點擊會新增/刪除/出貨/入倉的破壞性按鈕；若需要真實操作測試，必須明確標示為「需使用者實測」。

## V487 additional mandatory rule
- Diagnostics must separate **current-version errors** from old-version history. Old history may be shown, but must not be used to claim the current package still has that exact error unless the app/static version matches.
- Warehouse structure actions (`/api/warehouse/cell`, `/api/warehouse/batch-add-slots`, `/api/warehouse/mark-cell`) must return a fast touched-column payload and must not recompute the full unplaced/available list in the same request.
- Do not remove batch buttons globally unless the user explicitly says the exact button location/page to remove.
