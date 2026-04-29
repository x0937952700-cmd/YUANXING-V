# 沅興木業 CLEAN V1 乾淨主線整合版

這版不再載入 FIX135～FIX151 舊母版，不使用重複 hardlock / guard 檔案。

## 原則

- 乾淨主線：每頁只載入自己的 JS。
- 不做獨立「出貨紀錄頁」（依最新指示：第 11 項不做）；出貨紀錄仍保留在資料庫與今日異動中。
- 支援 SQLite / PostgreSQL，自動以 `DATABASE_URL` 判斷。
- 支援 Render 部署。

## 頁面

- 登入 / 註冊
- 首頁
- 庫存
- 訂單
- 總單
- 入庫 / 文字整理
- 出貨
- 倉庫圖
- 客戶資料
- 今日異動
- 設定

## 部署

1. 將本資料夾整包上傳 GitHub。
2. Render 選 Web Service。
3. Start Command 使用：`gunicorn app:app`
4. 若有 PostgreSQL，設定 `DATABASE_URL`。
5. 設定 `SECRET_KEY`。

## 預設帳號

第一次進入可直接註冊。若註冊名稱為「陳韋廷」，自動為管理員。
