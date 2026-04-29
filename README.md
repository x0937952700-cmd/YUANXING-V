# 沅興木業 CLEAN V1 全新母版

這包是從舊 FIX151 壓縮檔中剝離「要保留的功能、介面、按鈕、資料庫方向」後重新整理的乾淨母版。

## 這版的核心差異

- 不再載入 `FIX135～FIX151` 舊版 JS/CSS。
- 不再用多層 `開啟中...` 全頁遮罩。
- 首頁、庫存、訂單、總單、入庫、出貨、倉庫圖、客戶資料、今日異動、出貨紀錄、設定分頁清楚分離。
- 後端每個 API 都回 JSON，錯誤不會直接變白畫面。
- 資料庫支援 SQLite 與 Render PostgreSQL：有 `DATABASE_URL` 就走 PostgreSQL，沒有就走 SQLite。
- 有 PWA manifest / service-worker / app icon，可加到手機主畫面。

## 頁面

1. 登入 / 註冊
2. 首頁
3. 庫存
4. 訂單
5. 總單
6. 入庫 / OCR貼文字整理
7. 出貨
8. 倉庫圖
9. 客戶資料
10. 今日異動
11. 出貨紀錄
12. 設定 / 備份 / 使用者管理

## Render 設定

Build Command：

```bash
pip install --upgrade pip && pip install -r requirements.txt
```

Start Command：

```bash
gunicorn app:app --bind 0.0.0.0:$PORT
```

環境變數建議：

- `PYTHON_VERSION=3.11.11`
- `SECRET_KEY=自己隨機字串`
- `DATABASE_URL=Render PostgreSQL 連線字串`（可選；沒有就用 SQLite）

## 本機測試

```bash
pip install -r requirements.txt
python app.py
```

打開：

```text
http://127.0.0.1:5000
```

第一次註冊的帳號會自動成為管理員；姓名為 `陳韋廷` 也會是管理員。

## Smoke Test

```bash
python tools/smoke_test.py
```

通過會看到：

```text
CLEAN V1 smoke test passed
```

## 注意

這是乾淨母版，不是把舊檔全部疊上去。舊版大型 `static/app.js`、`static/yx_modules/fix*.js`、重複 hardlock CSS/JS 都沒有放進來，避免互相覆蓋與拖慢。
