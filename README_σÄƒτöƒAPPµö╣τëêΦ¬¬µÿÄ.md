# 這次已幫你改的內容

## 1) 今日異動刪除即時生效
- 已修改 `static/app.js`
- 按下刪除後，前端會直接用刪除後的最新資料重新渲染頁面，不需要返回再重開

## 2) 取消 Google OCR
- 已修改 `app.py`
- `/api/upload_ocr` 現在會直接提示：這版已取消雲端 Google OCR
- 設定頁已改成顯示「手機原生 OCR 模式」
- `db.py` 預設也改成 Google OCR 關閉、原生 OCR 開啟

## 3) 改成原生 App OCR 流程
- 已新增 `app.py` 的 `/api/native-ocr/parse`
- 已新增 `ocr.py` 的 `process_native_ocr_text()`
- 你手機端辨識完的文字，會送回後端做格式整理與客戶名模糊比對，再直接回填到原本畫面

## 4) 保留原本功能
- 庫存
- 訂單
- 總單
- 出貨
- 倉庫圖
- 客戶資料
- 今日異動
- 黑名單管理
- 備份

## 5) 新增原生 App 專案
請看：
- `native_app/`
- `native_app/README_NATIVE_APP.md`

這個原生 App 殼層會：
- 開啟你原本系統
- 接手機相機 / 相簿
- 用手機原生 OCR 辨識
- 把文字直接回填到你原本系統頁面
