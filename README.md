# 沅興木業｜主頁美麗乾淨介面版

這版只保留 `主頁美麗.zip` 的介面、頁面、按鈕與樣式，不接正式業務功能。

Start Command：

```bash
gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120
```

Render 需要設定 `DATABASE_URL`。

資料庫檢查：`/api/db-check`
