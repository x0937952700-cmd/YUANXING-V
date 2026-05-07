# V133 全面 Bug 修復包

- API 500 改成 JSON 錯誤，方便手機/Render 排錯。
- PostgreSQL pool 失效/卡住時自動 reset，再重連。
- 保留 Render fast boot，不在 import 階段卡 DB。
- 新增 /api/v133/bug-audit、render-readiness、smoke-report、capabilities。
- 新增 V133 前端檢查面板。
- 快取版本更新到 V133。
- 不清空、不重建、不洗掉 warehouse_cells。
