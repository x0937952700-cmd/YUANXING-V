# 沅興木業系統｜最終完整整合需求清單

本版已開始把需求落到主檔：手機 IndexedDB 快取、同步狀態列、手機桌機版橫向滑動、倉庫淡色樣式、增量同步 API。

## 核心禁止規則
- 不用補丁、overlay、hardlock。
- 不使用 setInterval / MutationObserver 硬塞按鈕或補事件。
- 不大改架構。
- 不清空、不重建、不洗掉 warehouse_cells。
- 只改主檔、只修指定 bug。
- 倉庫只補缺格，不重排有商品格。
- 批量編輯先前端生效，再背景寫 DB。
- 新增 / 插入 / 刪除格子一定要 DB 同步。

## 已納入主檔方向
- 庫存 / 訂單 / 總單 / 今日異動 / 倉庫圖 IndexedDB 顯示快取。
- 開頁先有快取可 fallback，背景同步 PostgreSQL。
- /api/sync-changes 支援 changed_after 增量同步。
- 手機版面接近桌機版，倉庫與表格可整區左右滑動。
- 同步狀態列：同步中 / 已同步 / 離線模式。
- 倉庫格淡色 UI：有貨淡黃、空格更淡、問題格淡紅。
