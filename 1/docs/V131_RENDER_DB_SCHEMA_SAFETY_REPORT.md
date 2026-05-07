# V131 Render DB Schema Safety Package

- Keeps V129/V130 fast port boot.
- Adds schema diagnostics after service is live.
- Adds manual safe DB ensure endpoint that runs init_db plus additive column patch only.
- Fixes missing BASE_DIR runtime bug for readiness routes.
- Does not rebuild/clear/delete warehouse_cells.

APIs:
- /api/v131/db-schema-diagnostics
- /api/v131/db-ensure-now
- /api/v131/db-bootstrap-status
- /api/v131/render-readiness
- /api/v131/smoke-report
- /api/v131/capabilities
