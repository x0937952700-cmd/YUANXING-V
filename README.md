# 沅興木業 FIX124 簡約淡灰標籤母版硬鎖版

版本號：`fix124-minimal-grey-label-hardlock`

## 本次修正

1. 主頁功能標籤改成簡約淡灰色。
   - 移除金色華麗框、異形框、蘋果風覆蓋感。
   - 標籤寬度改成剛好包住文字，不再整排長條。
   - 文字置中、字體保留清楚大字。

2. 一般按鈕同步改成簡約淡灰風格。
   - 只改 CSS 視覺。
   - 不改 onclick、submit、API、資料庫、出貨、倉庫、客戶資料、批量功能。

3. 另外接入母版。
   - 新增：`static/yx_modules/minimal_grey_ui_v124_hardlock.js`
   - 由 `master_integrator.js` 最後安裝。
   - 會覆蓋舊版 `luxury_label_ui_hardlock.js`、`luxury_label_ui_v122_hardlock.js`、蘋果風樣式。

4. 速度保護。
   - FIX124 樣式模組不建立長時間 MutationObserver。
   - 會關閉 FIX122 標籤樣式監控，避免舊金框一直重套造成跳版。
   - 只用少量延遲補強，避免影響頁面速度。

## 母版規則

- 新樣式入口：`minimal_grey_ui_v124_hardlock.js`
- 母版入口：`master_integrator.js`
- 舊版視覺可以保留檔案，但不允許最後接管畫面。
- 客戶資料保護仍由 `customer_data_guard_hardlock.js` 負責。
- 商品四顆按鈕同排規則仍保留。

## 保留功能

以下功能未被修改：

- 庫存、訂單、總單送出流程
- 出貨預覽與出貨扣庫存
- 倉庫圖新版渲染與長按格子操作
- 北中南客戶清單與長按 / 右鍵操作
- 客戶資料保護快取
- 批量材質、批量刪除
- 商品排序規則
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

已保留 smoke test：

```bash
python tools/smoke_test.py
```

可用語法檢查：

```bash
python -S -m py_compile app.py db.py backup.py ocr.py
node --check static/yx_modules/minimal_grey_ui_v124_hardlock.js
```
