# V134 卡在整理中修復包

- 移除首頁工作台總覽與智能搜尋助手區塊。
- 停用 V127～V133 自動診斷面板，避免首頁大量 fetch 與 Failed to fetch。
- 保留 Render/DB API，但不再自動渲染到主頁。
- 新增 V134 cleanup watchdog，清掉殘留 loading/syncing 狀態。
- 不清空、不重建 warehouse_cells。
