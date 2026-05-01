# 檢查與修復報告

## 已比對主頁美麗.zip
- `templates/index.html` 完全對齊。
- `templates/module.html`、`settings.html`、`today_changes.html`、`login.html` 完全對齊。
- `static/style.css` 完全對齊。
- 已補回主頁美麗的 PWA meta、apple touch icon、theme color、pwa.js / service worker。
- 沒有載入舊版大量 JS hardlock，避免舊函式覆蓋新版、跳版、卡頓。

## 本次修復
- 移除「功能尚未接入」提示文字。
- PostgreSQL pool 改成 lazy 建立，避免 Render DB 短暫未就緒造成整站 boot crash。
- 修復商品編輯時未帶 customer/material 會被清空的問題。
- 修復舊資料 `quantity` 有值但 `qty=0` 時，訂單/總單/出貨/客戶商品查不到的問題。
- 修復未入倉件數統計只看 qty、忽略 quantity 的問題。
- 保留多人出貨交易鎖：PostgreSQL `FOR UPDATE`，SQLite `BEGIN IMMEDIATE`。
- 保留自動建表、補欄位、索引、A/B 倉格初始化。

## 已知取捨
- 為了不卡頓，不載入 `主頁美麗.zip` 裡大量舊版 JS；只保留其視覺模板、CSS、PWA 與必要資源。
