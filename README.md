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
PYTHON_VERSION=3.11.10
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
