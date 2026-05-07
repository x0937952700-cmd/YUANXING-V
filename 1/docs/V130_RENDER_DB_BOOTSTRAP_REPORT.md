# V131 Render 開機 / DB 初始化修復報告

- Web process 仍保持 fast boot：先開 port，不在 import 階段同步 init_db。
- 新增 /api/v131/db-bootstrap-status，可看 DB 模式與深度 counts。
- 新增 /api/v131/db-init-now，可在服務已 live 後手動補 DB 表/欄位。
- releaseCommand 改用 tools/render_db_init.py，輸出 JSON 報告，失敗不阻塞 Web 開 port。
- 前端新增 V131 Render / DB 開機檢查面板。
