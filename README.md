# 沅興木業 FIX125 單一新版介面母版硬鎖版

版本號：`fix125-single-interface-hardlock`

## 本次修正

1. 解決介面亂跳。
   - 新增 `static/yx_modules/interface_single_source_v125_hardlock.js`。
   - 舊版渲染函式保留在前端記憶中，但不再允許直接接管畫面。
   - 開頁時先暫時隱藏容易跳版的區塊，等母版新版渲染完成後才顯示。

2. 舊版不主動呼叫畫面。
   - `loadCustomerBlocks / renderCustomers` 轉交新版北中南客戶母版。
   - `renderWarehouse / renderWarehouseZones / renderWarehouse96 / renderWarehouse102` 轉交新版倉庫圖母版。
   - `loadTodayChanges` 轉交新版今日異動母版。
   - `YX_MASTER` 裡面的舊 UI 方法也被代理，不讓舊版從母版物件繞過去重畫。

3. 新版標籤只保留簡約淡灰版。
   - 不再載入 `luxury_label_ui_hardlock.js`。
   - 不再載入 `luxury_label_ui_v122_hardlock.js`。
   - 保留檔案但不呼叫，避免金框 / 蘋果風 / 淡灰風互相覆蓋造成跳版。

4. 保留所有功能。
   - 沒有刪除 API。
   - 沒有刪除舊函式檔案。
   - 沒有更動資料庫主流程。
   - 只隔離舊版「畫面輸出」，按鈕事件與資料功能仍由新版母版接管。

## 母版載入順序

1. `core_hardlock.js`
2. `interface_single_source_v125_hardlock.js`
3. `minimal_grey_ui_v124_hardlock.js`
4. `app.js`
5. 各功能母版模組
6. `legacy_isolation_hardlock.js`
7. `master_integrator.js`

`master_integrator.js` 永遠最後執行，最後只釋放新版畫面。

## 這版保護的新版畫面

- 主頁簡約淡灰功能標籤
- 今日異動固定標籤與小卡
- 北 / 中 / 南客戶新版清單
- 客戶點開後商品清單
- 庫存 / 訂單 / 總單商品小卡與批量功能
- 倉庫圖新版格子介面
- 出貨客戶商品下拉選單

## 保留功能

以下功能未被移除：

- 庫存、訂單、總單送出流程
- 出貨預覽與出貨扣庫存
- 倉庫圖新版渲染與長按格子操作
- 北中南客戶長按 / 右鍵操作
- 客戶資料安全快取與安全快照
- 批量材質、批量刪除
- 商品排序規則
- 今日異動長按刷新未錄入倉庫圖
- PWA 安裝與 service worker

## 部署

Render Start Command：

```bash
gunicorn app:app
```

環境變數建議：

```bash
SECRET_KEY=自行設定
DATABASE_URL=Render PostgreSQL 連線字串，可選
PYTHON_VERSION=3.11.10
```

## 檢查

```bash
node --check static/yx_modules/interface_single_source_v125_hardlock.js
node --check static/yx_modules/master_integrator.js
python -S -m py_compile app.py db.py backup.py ocr.py
python -S tools/smoke_test.py
```
