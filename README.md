# 沅興木業 FIX141 Render 部署確實修復 + README 母版統整版

本版是 FIX139 的部署修正版，目標是解決 Render 無法部署與新版母版被舊版覆蓋的問題。

## 部署修復

1. 新增 `.python-version`，固定 Render Dashboard 直接部署時使用 Python 3.11.11。
2. 更新 `runtime.txt` 為 `python-3.11.11`，保留兼容。
3. 更新 `render.yaml`：
   - Build Command：`pip install --upgrade pip && pip install -r requirements.txt`
   - Start Command：`gunicorn app:app --config gunicorn.conf.py`
   - `PYTHON_VERSION=3.11.11`
   - `SECRET_KEY` 自動產生
   - healthCheckPath：`/health`
4. 確認根目錄必備檔案完整：`app.py / db.py / requirements.txt / Procfile / render.yaml / .python-version / static / templates`。

## 母版統整

1. 版本號升級：`fix141-render-502-db-safe-master`。
2. README / 歷代 FIX 要求重新接到最後母版：
   - `static/yx_modules/fix140_readme_master_hardlock.css`
   - `static/yx_modules/fix140_readme_master_hardlock.js`
3. 舊版 `app.js` 保留為功能輔助庫；新版視覺與主要入口最後接管，避免舊版畫面覆蓋。
4. 保留：客戶合併、109 資料救援、自動件數判定、完整直列表格、A/B 區、出貨檢查、倉庫拖拉、還原功能、雲彩背景、按鈕標籤外觀。

## GitHub 上傳方式

不要只上傳 ZIP。請先解壓縮，然後把解壓縮後的所有檔案放到 GitHub repo 根目錄。
GitHub 根目錄要直接看到 `app.py`，不能只看到一個 `.zip` 檔。

## Render 設定

Root Directory：留空
Build Command：`pip install --upgrade pip && pip install -r requirements.txt`
Start Command：`gunicorn app:app --config gunicorn.conf.py`
Environment：如果 Render 後台已經有 `PYTHON_VERSION`，請改成 `3.11.11`。


---

# FIX141 README 統整母版硬鎖版

本版目的：修復 Render/GitHub 部署常見問題，並把 README 與歷代 FIX 已確認需求統一接到最後母版。

## 主要修復

1. 版本號統一升級為 `fix141-render-502-db-safe-master`，Service Worker / PWA / manifest / base.html 全部同步，避免手機或瀏覽器吃到舊版快取。
2. 新增最後母版：
   - `static/yx_modules/fix140_readme_master_hardlock.css`
   - `static/yx_modules/fix140_readme_master_hardlock.js`
3. 新母版最後載入，負責接管視覺與操作入口；舊版 `app.js` 保留作為輔助函式庫，不再讓舊版主動畫面覆蓋新版。
4. 一般按鈕固定黑字，刪除 / 批量刪除 / 重要操作固定紅字；按下或滑過時銀色內圈更明顯。
5. 修復空白按鈕：會依照 `data-*` 屬性自動補回「編輯 / 直接出貨 / 加到訂單 / 加到總單 / 刪除 / 還原上一步」等文字。
6. 庫存 / 訂單 / 總單固定完整直列表格，不用下拉、不產生下方小卡；總單列操作按鈕清除。
7. 客戶卡固定三段：左側客戶名、中間 CNF / FOB / FOB代、右側件 / 筆。
8. 倉庫圖由新版母版接管；舊版倉庫面板隱藏，A 倉 / B 倉未入倉清單會依區域帶入 `zone=A/B`。
9. 出貨頁補客戶快速選擇與客戶商品完整清單；客戶名稱輸入後會自動重新載入該客戶商品。
10. 保留還原功能：還原上一步與設定頁差異紀錄單筆還原都保留。
11. 加入 `runtime.txt`，協助 Render 固定 Python 3.11.11。

## 部署注意

請不要把 ZIP 直接上傳到 GitHub。必須先解壓縮，然後把解壓後的內容上傳到 GitHub 根目錄。根目錄要直接看到：

- `app.py`
- `db.py`
- `requirements.txt`
- `Procfile`
- `render.yaml`
- `runtime.txt`
- `static/`
- `templates/`

Render 設定建議：

- Build Command：`pip install --upgrade pip && pip install -r requirements.txt`
- Start Command：`gunicorn app:app --config gunicorn.conf.py`
- Root Directory：留空

## 測試

已執行：

- Python compile OK
- FIX141 smoke test OK
- 新母版 JS 語法 OK
- Service Worker JS 語法 OK

---

# FIX128 完整商品清單 + 上方編輯母版硬鎖版

- 出貨客戶商品改成完整直列顯示，不再靠下拉式。
- 庫存 / 訂單 / 總單新增「編輯全部」，可直接改材質、尺寸、支數 x 件數、數量、客戶名。
- 小卡編輯按鈕移到上方，按下後可在小卡內直接編輯所有欄位。
- 修復「尤加利 / 尤佳利」材質選單與後端套用。
- 新增 inline_edit_full_list_hardlock.js 母版接管，避免舊版覆蓋。

# FIX122 客戶/商品救援

- 從 inventory / orders / master_orders / shipping_records 補回缺少的客戶檔。

- 修正 customer_uid 不一致導致客戶商品看起來丟失的問題。

- 新增 /api/recover/customers-from-relations 手動救援入口。

- 不刪資料、不覆蓋既有商品。

# 沅興木業 FIX120 客戶商品回復母版硬鎖版

本版修正：客戶名稱存在但點開商品不見、總單/訂單依客戶篩選被舊版覆蓋、舊客戶只存在商品表但未同步到 customer_profiles 時不顯示。

原則：不刪功能、不改資料 API 主流程、不動出貨/倉庫/批量操作；只補客戶清單來源與前端母版篩選。

## FIX120 硬鎖內容
- 客戶清單會補回 inventory / orders / master_orders / shipping_records 裡仍有商品的舊客戶。
- 客戶點選後不再呼叫舊版 selectCustomerForModule 清空新版商品面板。
- 庫存 / 訂單 / 總單商品篩選支援 FOB / CNF 標籤差異，不會因客戶名顯示標籤不同而找不到商品。
- 母版仍由 static/yx_modules/master_integrator.js 最後統一接管。

# 沅興木業｜最終商用整合版 FIX120

本版是 **母版硬鎖整合版**。原則是：舊版沒有被指定修改的功能全部保留；這次有明確要求的地方一律由 FIX120 模組接管，避免舊函式、舊 timer、舊 MutationObserver 或舊版渲染流程把新版畫面蓋回去。

版本號統一為：`fix120-apple-sort-hardlock`。

---

## 這版修正重點

### 1. 差異紀錄固定範圍

設定頁的「差異紀錄」現在只顯示當天與下列模組有關的操作：

- 訂單
- 總單
- 庫存 / 進貨
- 出貨
- 倉庫圖

以下舊雜訊不再顯示在差異紀錄中：

- `customer_items`
- `customer_profiles`
- OCR 修正詞
- 登入紀錄
- 代辦事項
- 其他舊版內部同步紀錄

後端 `/api/audit-trails` 已改為預設只抓今天，並套用白名單篩選。匯出操作紀錄時也同步使用同一套篩選規則。

### 2. 設定頁 OCR 模式區塊移除

設定頁的「OCR 模式」說明區已移除。後端 OCR / 原生上傳 / 拍照辨識功能仍保留，只是不再在設定頁顯示這塊說明，避免畫面多出無用卡片。

### 3. 管理員功能 500 修復

`/api/admin/users` 已改成相容讀取：

- 先執行 `init_db()` 補齊舊資料庫欄位
- `list_users()` 失敗時改用安全 fallback 讀取
- 即使舊資料庫缺欄位，也不再讓畫面直接顯示 `請求失敗：500`

`/api/admin/block` 也加上錯誤保護，封鎖 / 解除封鎖後會重新載入名單。

### 4. 庫存 / 訂單 / 總單清單固定新版

新增 `static/yx_modules/product_actions_hardlock.js`，由母版最後載入並接管三個清單：

- 庫存清單
- 訂單清單
- 總單清單

固定功能：

- 清單上方顯示新版統整表
- 點選表格列會批量選取
- 下方小卡會依選取內容即時篩選
- 未選取時，下方小卡顯示目前清單全部商品
- 庫存小卡固定有：編輯、刪除、加到訂單、加到總單
- 訂單 / 總單小卡固定有：編輯、直接出貨、刪除

### 5. 批量增加材質 / 批量刪除

庫存、訂單、總單清單上方都新增批量工具列：

- 全選目前清單
- 搜尋商品 / 客戶 / 材質
- 批量增加材質下拉式選單
- 套用材質
- 批量刪除

批量材質與批量刪除仍使用原本後端 API，保留舊功能，但畫面由 FIX120 工具列統一接管。批量增加材質下拉式選單已加入 `尤佳利`，且下拉選單、套用材質、批量刪除固定靠右同一排。

### 6. 北 / 中 / 南客戶列表固定新版

新增 `static/yx_modules/customer_regions_hardlock.js`。

新版顯示規則：

- 客戶名稱在左側
- `CNF` / `FOB` / `FOB代` 顯示成置中的標籤
- `件 / 筆` 靠右
- 不顯示右側箭頭
- 各區客戶改成兩個兩個排列
- 客戶卡片加大，避免只剩一個字或被舊版寬度截斷
- 舊版客戶卡片、箭頭、舊 DOM 一出現就由母版重畫回新版

訂單頁只顯示有訂單的客戶；總單頁只顯示有總單的客戶。點選客戶後會立即刷新下方商品清單。若舊版客戶卡片再次渲染，母版會用新版客戶卡片覆蓋回來，不允許舊介面直接接管畫面。

### 7. 北 / 中 / 南客戶長按操作

客戶卡片現在支援長按或右鍵開啟操作表：

- 打開客戶商品
- 編輯客戶
- 移到北區
- 移到中區
- 移到南區
- 刪除客戶

操作完成後會立即重新載入客戶列表，並同步刷新商品清單，不需要手動重新整理。

### 8. A / B 倉格子顯示固定

倉庫格子顯示已固定為兩行，不再顯示 FOB / CNF / 尺寸 / 商品資訊。

固定格式：

```text
1  立凡/永和/保固
4+2+1          7件
```

顏色規則：

- 客戶名稱：紅色
- 支數加總與總件數：藍色
- 未指定客戶：顯示 `庫存`
- 格號只顯示數字，不顯示「第 X 格」

舊版倉庫顯示函式若再次觸發，會被 `warehouse_hardlock.js` 轉接到新版渲染入口；舊版倉庫 DOM 會被清理成新版格式。格號與客戶名稱固定同一行，客戶名稱只與格號空一格。

### 9. 母版模組化硬鎖

本版由 `templates/base.html` 最後載入以下模組：

```text
static/yx_modules/core_hardlock.js
static/yx_modules/today_changes_hardlock.js
static/yx_modules/warehouse_hardlock.js
static/yx_modules/settings_audit_hardlock.js
static/yx_modules/customer_regions_hardlock.js
static/yx_modules/product_sort_hardlock.js
static/yx_modules/product_actions_hardlock.js
static/yx_modules/ship_picker_hardlock.js
static/yx_modules/legacy_isolation_hardlock.js
static/yx_modules/apple_ui_hardlock.js
static/yx_modules/master_integrator.js
```

`master_integrator.js` 會依目前頁面安裝需要的模組：

- 今日異動 → 今日異動硬鎖
- 倉庫圖 → 倉庫硬鎖
- 訂單 / 總單 / 出貨 / 客戶 → 北中南客戶硬鎖
- 出貨 → 客戶商品下拉立即刷新硬鎖
- 庫存 / 訂單 / 總單 → 商品清單硬鎖
- 設定 → 差異紀錄與管理員功能硬鎖
- 全頁 → 舊版渲染隔離硬鎖

`legacy_isolation_hardlock.js` 只處理舊畫面殘留：舊箭頭、舊倉庫卡、舊批量工具列、舊今日異動雜訊。它不刪除舊功能，也不改資料 API，只讓畫面固定使用新版母版。

這樣日後要改單一功能時，可以只改對應模組，再由母版統一整合，避免互相覆蓋。

### 10. 今日異動未錄入倉庫圖長按刷新

今日異動中的「未錄入倉庫圖」標籤 / 小卡支援長按刷新。

- 點一下仍然是篩選未錄入倉庫圖
- 長按會重新抓取未錄入倉庫圖資料
- 不再主動重複刷新造成跳版或卡頓

### 11. 出貨客戶商品下拉立即刷新

新增 `static/yx_modules/ship_picker_hardlock.js`。

出貨頁輸入或點選客戶名稱後，`客戶商品清單` 下拉選單會立刻重新抓取該客戶所有商品。

固定規則：

- 監聽 `customer-name` 的輸入與變更
- 120ms 內自動刷新下拉選單
- 重新載入、加入選取商品、整個加入下方商品資料由母版接管
- 舊版 `loadShipCustomerItems66 / 82 / 83` 入口全部轉接到新版函式
- 不改後端 API，不影響原本出貨扣除、反查、預覽功能


### FIX120 本次追加硬鎖

- 北區 / 中區 / 南區客戶卡片保持「一排一個客戶」，保留長按 / 右鍵操作表、移區、編輯、刪除、點客戶載入商品等既有功能。
- 舊版客戶卡片若再次輸出，會先被隱藏，再由母版重新渲染成新版一列式卡片，避免舊介面影響畫面。
- `static/yx_modules/apple_ui_hardlock.js` 改成真正注入執行中的蘋果風按鈕樣式，並在 `templates/base.html` 先寫入 `data-yx118-apple-ui`，讓首頁與功能頁都能套用，不等舊 CSS。
- 新增 `static/yx_modules/product_sort_hardlock.js`，專門處理庫存 / 訂單 / 總單顯示排序；不改資料庫、不改送出流程、不改任何 API。
- 商品排序固定為：材質 → 高 → 寬 → 長由小到大；同商品再依件數 → 支數由大到小。
- `master_integrator.js` 最後統一安裝 `apple_ui` 與 `product_sort`，讓按鈕風格與商品排序都由母版硬鎖，不被舊版覆蓋。

---

## 主要檔案

```text
app.py
static/app.js
static/style.css
static/pwa.js
static/service-worker.js
static/manifest.webmanifest
templates/base.html
templates/settings.html
static/yx_modules/core_hardlock.js
static/yx_modules/today_changes_hardlock.js
static/yx_modules/warehouse_hardlock.js
static/yx_modules/settings_audit_hardlock.js
static/yx_modules/customer_regions_hardlock.js
static/yx_modules/product_sort_hardlock.js
static/yx_modules/product_actions_hardlock.js
static/yx_modules/ship_picker_hardlock.js
static/yx_modules/legacy_isolation_hardlock.js
static/yx_modules/apple_ui_hardlock.js
static/yx_modules/master_integrator.js
```

---

## Render 部署

Start Command：

```bash
gunicorn app:app
```

建議環境變數：

```text
SECRET_KEY=任意長字串
DATABASE_URL=Render PostgreSQL 連線字串
PYTHON_VERSION=3.11.11
```

如果手機或瀏覽器仍看到舊畫面，請清除網站資料或重新安裝 PWA；本版快取版本已更新為 `fix120-apple-sort-hardlock`。

---

## 本版驗證

已檢查項目：

- JavaScript 語法檢查
- 母版模組載入順序
- PWA / Service Worker 版本號
- 設定頁 OCR 模式區塊移除
- 差異紀錄 API 篩選
- 管理員名單相容讀取
- 庫存 / 訂單 / 總單批量工具列與小卡篩選
- 北中南客戶長按操作模組
- 北中南客戶一排一個新版卡片
- 蘋果風按鈕介面母版
- 庫存 / 訂單 / 總單排序：材質 → 高 → 寬 → 長；同商品件數 → 支數
- A / B 倉格子新版顯示格式

---

## 版本紀錄

- FIX111：開功能 / 返回主頁速度優化。
- FIX112：README 統一、功能模組拆分、母版最後整合、今日異動標籤與小卡硬鎖。
- FIX113：差異紀錄範圍硬鎖、設定頁 OCR 區塊移除、管理員 500 相容、商品清單批量材質 / 批量刪除、表格選取後小卡篩選、北中南客戶標籤與長按操作、A/B 倉格子顯示硬鎖。
- FIX114：移除訂單 / 總單客戶箭頭、北中南客戶兩欄硬鎖、批量工具列三件套靠右同排、材質加入尤佳利、倉庫格號與客戶距離收緊、今日異動未錄入倉庫圖長按刷新。
- FIX116：舊版渲染隔離、原生 MutationObserver 只開給母版監控、商品批量選取狀態保留、倉庫 / 客戶 / 今日異動 / 設定頁新增最後一道畫面硬鎖，不改資料功能。
- FIX120：蘋果風按鈕介面改為真正母版注入，庫存 / 訂單 / 總單新增獨立商品排序母版；排序規則為材質 → 高 → 寬 → 長由小到大，同商品件數 → 支數由大到小；全程不改資料功能。

--- FIX124 補充 ---
FIX124 淺灰金邊圓型標籤 + 母版接管收斂版

本包基於 FIX122，不刪除既有功能，保留 109 客戶/商品救援邏輯，並做以下修正：

1. 全站版本號改為 fix125-customer-merge-master-hardlock。
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


--- FIX125 補充 ---
沅興木業 FIX125 相同客戶合併母版硬鎖版

本次修正重點：
1. 北/中/南客戶標籤若出現同一客戶重複卡片，會自動合併成一張。
   例如：山益 CNF、山益CNF、空白差異造成的重複客戶，畫面只顯示一張山益 CNF。
2. 合併後件數與筆數會加總，不會少算。
   例如：126件/8筆 + 25件/4筆 => 151件/12筆。
3. 點進合併後的客戶，會同時撈回所有舊名稱底下的訂單 / 總單 / 庫存商品。
4. 後端 /api/customers 已加上客戶合併防呆，前端 customer_regions_hardlock 也加一層母版防呆。
5. 商品清單篩選也改用相同合併鍵，避免舊名稱空白差異造成商品顯示不完整。
6. 不刪除任何客戶或商品，只在顯示與查詢時合併，保留原資料完整性。
7. 版本號更新為 fix125-customer-merge-master-hardlock，避免 PWA/手機吃到舊快取。

--- FIX126 補充 ---
沅興木業 FIX126 自動件數判定母版硬鎖版

1. 移除商品編輯時的「數量 / 修改數量」瀏覽器輸入框。
2. 數量改由商品文字自動判定：等號右側有 xN 就算 N 件，沒有 xN 的支數/長度則算 1 件。
3. 範例：132x23x05=249x3 算 3 件；132x23x05=249 算 1 件；60+54+50 算 3 件。
4. 保留 100x30x63=504x5+588+... 特例，仍算 10 件。
5. 修正只有尺寸 100x30x63 被誤判為 63 件的風險，改判 1 件。
6. 後端 inventory/orders/master_orders/customer-item 更新 API 也改為自動件數，避免舊畫面送 qty 造成覆蓋。
7. 新增 static/yx_modules/quantity_rule_hardlock.js，並在 app.js 前載入，讓舊函式也套用同一件數規則。
8. 版本號更新為 fix128-inline-edit-full-list-hardlock，避免 PWA/手機吃到舊快取。


## FIX129 商品母版完整接管修復
- 修復 loadSource is not defined，補回 product_actions 母版的 loadSource / renderCards / refreshCurrent。
- 新增 product_source_bridge_hardlock.js，把舊版刷新入口導回母版。
- 保留 FIX128 完整清單、上方編輯全部、小卡直接編輯與尤加利/尤佳利材質。


FIX148 安全頁面收斂加速版

本版原則：不刪功能、不改頁面結構、不動原本按鈕，只把會拖慢與會覆蓋新版的舊邏輯再收斂。

已處理：
1. base.html 改成頁面級輕量載入：
   - 首頁不再載入 app.js 與出貨/倉庫/商品舊母版。
   - 設定頁只載入設定必要功能與差異紀錄，不載入出貨/倉庫/商品舊母版。
   - 今日異動只載入今日異動 renderer，不載入 app.js 與倉庫/出貨舊母版。
   - 功能頁仍保留原本功能庫與舊檔相容層，避免功能消失。

2. 新增 static/yx_modules/fix148_final_safe_speed.js：
   - API timeout，避免送出/載入卡死時按鈕永遠鎖住。
   - 危險按鈕短時間防重複點擊，避免舊版與新版 handler 同時送出。
   - 設定頁輕量版 changePassword / undoLastAction / downloadReport / createBackup / logout。
   - 首頁今日異動 badge 用最小 API 背景更新。
   - 內建 YX148HealthCheck，可在瀏覽器 console 檢查目前載入哪些母版。

3. 今日異動刪除加速：
   - 刪除單筆活動後，前端直接移除該卡片。
   - 後端 /api/today-changes/<id> 不再重新計算整包今日異動與未入倉。
   - 需要重新計算時仍保留「刷新」按鈕。

4. Service Worker / PWA：
   - 版本升級為 fix148-safe-page-converge。
   - 舊檔保留，但不再把全部舊母版 precache。
   - 靜態檔仍網路優先，避免手機吃舊快取。

5. 資料庫安全加速：
   - 新增 logs、audit_trails、customer_profiles、warehouse_cells 常用查詢索引。
   - 差異紀錄改成 SQL 先 LIMIT，不再先整表撈出來再 Python 篩選。

保留：
- 原本頁面 HTML、按鈕、API、舊檔案都保留。
- 功能頁仍照原本方式載入完整功能庫。
- 只對首頁 / 設定 / 今日異動做輕量載入，降低返回主頁和開設定卡頓。

---

## FIX150 標籤文字顯示安全修復

修復首頁淡灰色標籤文字顯示不出來的問題。這版只新增文字可見保護層，不刪功能、不改頁面結構、不動按鈕。

## FIX151 首頁導頁遮罩與背景修復

這版只修 FIX150 後的安全問題：標籤文字不再用 JS 改動按鈕 DOM；首頁背景強制恢復；導頁遮罩不再全畫面模糊蓋住背景，且會自動解除，避免卡在「開啟中…」。
