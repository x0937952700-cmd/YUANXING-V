# V127 實機 / Render 穩定檢查包

本包不新增大功能，重點是 V126 合併收尾後的主檔穩定性、API 相容、版本快取與實機檢查入口。

## 已補

- `/api/v127/capabilities`
- `/api/v127/render-readiness`
- `/api/v127/smoke-report`
- `/api/v127/remaining-progress`
- `/api/v127/open-focus-target` 等跳轉相容別名
- `/api/v127/shipping-deduct-trace` 扣倉庫追蹤相容別名
- `/api/v127/warehouse-action-timeline` 倉庫時間軸相容別名
- 前端 V127 實機檢查面板
- service worker / base template / pwa version 更新到 V127

## 剩餘

不是主檔功能包，剩 Render、手機與多人同時操作實機驗證。
