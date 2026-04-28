# 沅興木業 FIX122 華麗圓框標籤 + 商品按鈕同排母版硬鎖版

本版只處理本次指定的畫面硬鎖，不改資料庫主流程、不改 API 行為、不改送出、出貨、倉庫、批量、客戶操作等既有功能。舊版功能保留；舊版視覺若與新版衝突，改由母版最後接管，避免舊介面覆蓋新版。

版本號：`fix123-ornate-frame-fit-hardlock`

---

## FIX122 本次新增 / 覆蓋

### 1. 主頁功能標籤改成圖二白金圓框風格

- 主頁「庫存、訂單、總單、出貨、出貨查詢、倉庫圖、客戶資料、代辦事項」全部改成白底金框圓角華麗標籤。
- 不使用帶馬賽克或浮水印的圖片，改用乾淨 CSS 畫出標籤，避免旁邊殘留馬賽克。
- 字體加大、加粗，並固定置中對齊「沅興木業」。
- 舊版圖一金色長標籤與蘋果風按鈕不再主動接管新版畫面。

### 2. 商品小卡四個按鈕固定同一排

庫存小卡的：

- 編輯
- 刪除
- 加到訂單
- 加到總單

已固定成同一排顯示，不再換行成兩排。只改排列與視覺，不改按鈕事件、不改 API、不改資料功能。

### 3. 華麗標籤另接母版

新增：

```text
static/yx_modules/luxury_label_ui_v122_hardlock.js
static/yx_modules/luxury_label_ui_v123_hardlock.js
```

這些檔案由 `templates/base.html` 載入，並由 `master_integrator.js` 最後安裝。用途是：

- 固定新版主頁金色異形框標籤
- 固定新版深綠金邊按鈕
- 固定商品小卡按鈕同排
- 監控舊版重畫後再補回新版樣式

### 4. 停止主動安裝蘋果風視覺

`apple_ui_hardlock.js` 檔案保留在專案中，但本版不再由母版主動安裝，避免蘋果風樣式先閃一下再跳回華麗風格。

---

## 已保留功能

- 登入 / 登出
- 設定頁與管理員功能
- 今日異動
- 庫存清單、批量增加材質、批量刪除、小卡篩選
- 訂單清單、客戶點選、商品小卡、直接出貨
- 總單清單、客戶點選、商品小卡、直接出貨
- 出貨頁客戶商品下拉即時刷新
- 出貨預覽 / 扣除流程
- A / B 倉新版倉庫圖
- 北 / 中 / 南客戶長按 / 右鍵操作表
- 客戶編輯、移動區域、刪除
- 客戶資料與客戶商品安全快取
- `customer_safety_snapshots` 刪除 / 更新前安全快照
- 商品排序：材質 → 高 → 寬 → 長由小到大；同商品件數 → 支數由大到小
- PWA / 手機加入主畫面

---

## 母版硬鎖規則

本專案的新版功能都放在：

```text
static/yx_modules/
```

母版最後整合檔：

```text
static/yx_modules/master_integrator.js
```

日後要改新版畫面，優先改 `yx_modules` 裡的硬鎖模組，不直接改舊版大檔 `static/app.js` 的渲染函式，避免舊功能互相覆蓋。

本版主要模組：

```text
core_hardlock.js
customer_data_guard_hardlock.js
today_changes_hardlock.js
warehouse_hardlock.js
settings_audit_hardlock.js
customer_regions_hardlock.js
product_sort_hardlock.js
product_actions_hardlock.js
ship_picker_hardlock.js
legacy_isolation_hardlock.js
luxury_label_ui_hardlock.js
luxury_label_ui_v122_hardlock.js
luxury_label_ui_v123_hardlock.js
master_integrator.js
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

如果手機或瀏覽器仍看到舊畫面，請清除網站資料或重新安裝 PWA；本版快取版本已更新為：

```text
fix123-ornate-frame-fit-hardlock
```

---

## 本版驗證

- JavaScript 語法檢查
- 母版模組載入順序檢查
- PWA / Service Worker 版本號更新
- 主頁金色異形框標籤新版樣式最後硬鎖
- 商品小卡按鈕同排樣式最後硬鎖
- 不修改既有資料 API 與功能流程

---

## 版本紀錄

- FIX111：開功能 / 返回主頁速度優化。
- FIX112：README 統一、功能模組拆分、母版最後整合、今日異動標籤與小卡硬鎖。
- FIX113：差異紀錄範圍硬鎖、設定頁 OCR 區塊移除、管理員 500 相容、商品清單批量材質 / 批量刪除、表格選取後小卡篩選、北中南客戶標籤與長按操作、A/B 倉格子顯示硬鎖。
- FIX114：移除訂單 / 總單客戶箭頭、批量工具列同排、材質加入尤佳利、倉庫格號與客戶距離收緊、今日異動未錄入倉庫圖長按刷新。
- FIX115：舊版渲染隔離，避免返回主頁與開功能時被舊版 timer / observer 拖慢。
- FIX116：母版唯一介面硬鎖，客戶、出貨下拉、倉庫圖都由新版接管。
- FIX117：北中南客戶改回一排一個，新增蘋果風視覺母版。
- FIX118：按鈕風格與商品排序母版硬鎖。
- FIX119：總單客戶穩定母版，補回只存在於商品表的舊客戶。
- FIX120：客戶商品回復母版，避免客戶商品被舊版清空。
- FIX121：華麗標籤 + 客戶資料安全快照。
- FIX122：主頁改白金圓框標籤，商品小卡四顆按鈕固定同排，蘋果風不再主動接管。
- FIX123：主頁改金色異形框標籤，寬度只包住文字，不再是長條圓角框；功能、API、資料流程不變。


## FIX123 補充
- 主頁功能標籤改成金色異形框造型，不再使用長條圓角框。
- 標籤寬度只包住文字，仍保持置中與母版最後載入硬鎖。
- 新增 `static/yx_modules/luxury_label_ui_v123_hardlock.js`，只改視覺，不改任何功能、API、資料庫或事件。
