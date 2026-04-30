# 沅興木業 Clean UI Shell

這是從原 ZIP 拆出的「乾淨介面版」。目前只保留介面、頁面、按鈕與 PostgreSQL 連線檢查，不接任何正式功能，方便之後一步步加回功能。

## 重點
- 沒有載入舊版大型 app.js / hardlock JS，避免卡頓與畫面亂跳。
- 所有按鈕字體為黑色；重要按鈕為紅色字體。
- 沒有整顆黑色按鈕，原本重要/主按鈕統一改成淺灰底。
- 首頁與各頁可立即切換。
- `/api/db-check` 會連 PostgreSQL 並建立 `ui_shell_meta` 小表，用來確認資料庫可用。

## Render 設定
Build Command:
```bash
pip install -r requirements.txt
```
Start Command:
```bash
gunicorn app:app
```
Environment Variables:
```bash
DATABASE_URL=你的 PostgreSQL 連線字串
SECRET_KEY=任意長字串
PYTHON_VERSION=3.11.11
```
