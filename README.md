# 沅興木業 CLEAN V1 乾淨主線整合版

這版是重新統整後的乾淨主線，不再載入 FIX135～FIX151 的舊母版檔案。

## 本版原則

- 舊 FIX 母版不再沿用。
- 每個頁面只載入自己的 JS。
- 不使用多層全頁「開啟中」遮罩。
- 按鈕只綁定一次事件。
- API 統一回傳 JSON 錯誤，不讓畫面卡死。
- 前端危險動作會帶 request_key，後端防重複送出。
- 支援 SQLite 本機測試與 PostgreSQL(Render DATABASE_URL)。

## 已包含頁面

1. 登入
2. 首頁
3. 庫存
4. 訂單
5. 總單
6. 入庫
7. 出貨
8. 倉庫圖
9. 客戶資料
10. 今日異動
11. 設定

依照最新指示，沒有另外建立「出貨紀錄」獨立頁；出貨紀錄仍會存進資料表，並會寫入今日異動。

## 部署到 Render

Build Command:

```bash
pip install -r requirements.txt
```

Start Command:

```bash
gunicorn app:app
```

環境變數：

- `SECRET_KEY`：建議設定隨機字串
- `DATABASE_URL`：有 PostgreSQL 時設定；沒設定則自動使用 SQLite
- `ADMIN_NAME`：預設為 `陳韋廷`

## 本機測試

```bash
pip install -r requirements.txt
python app.py
```

開啟：

```text
http://127.0.0.1:5000
```

第一次使用可在登入頁直接註冊。

## Render 啟動修正

本版已加入 `gunicorn.conf.py`，可相容 Render Start Command：

```bash
gunicorn app:app --config gunicorn.conf.py
```

如果 Render 後台 Start Command 曾手動設定，建議改成以下其中一種：

```bash
gunicorn app:app --config gunicorn.conf.py
```

或：

```bash
gunicorn app:app
```

兩種都可以；本包已同時保留 `Procfile` 與 `render.yaml`。


## CLEAN V1 DB Boot Fix
- 修正 Render 已部署但首頁 Internal Server Error：舊 PostgreSQL 資料表缺少 CLEAN V1 欄位時會自動補欄位。
- 修正 PostgreSQL boolean 參數相容問題。
- 舊 users.password 會在登入成功後自動升級為 password_hash。
