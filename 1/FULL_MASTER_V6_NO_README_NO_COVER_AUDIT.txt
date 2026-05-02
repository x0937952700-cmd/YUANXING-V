沅興木業 FULL MASTER V6 覆蓋修復檢查

已刪除 README/說明檔：29 個
FIX122_README.txt
FIX124_README.txt
FIX125_README.txt
FIX126_README.txt
FIX127_README.txt
FIX128_README.txt
FIX129_README.txt
FIX131_README.txt
FIX132_README.txt
FIX133_README.txt
FIX134_README.txt
FIX135_README.txt
FIX136_README.txt
FIX137_README.txt
FIX138_README.txt
FIX139_README.txt
README.md
FIX140_README.txt
FIX141_README.txt
FIX142_README.txt
static/yx_modules/fix140_readme_master_hardlock.css
static/yx_modules/fix135_master_final_hardlock.css
static/yx_modules/fix136_label_text_repair.css
static/yx_modules/fix137_undo_layout_warehouse_hardlock.css
static/yx_modules/fix138_final_master_hardlock.css
static/yx_modules/ornate_label_hardlock.css
static/yx_modules/home_background_hardlock.css
static/yx_modules/fix142_speed_ship_hardlock.css
static/yx_modules/final_mother_lock.css

已移除：static/yx_modules 舊 hardlock CSS/補丁資料夾，避免未來誤載入。

HTML script 載入：
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_login_master_v4.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_home_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_inventory_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_orders_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_master_order_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_ship_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_warehouse_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_today_changes_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_settings_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_shipping_query_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_todos_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='yx_pages/page_customers_master_v2.js') }}?v=full-master-v6-no-readme-no-cover"
templates/base.html: <script defer src="{{ url_for('static', filename='pwa.js') }}?v=full-master-v6-no-readme-no-cover"

CSS 載入：
templates/base.html: <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}?v=full-master-v6-no-readme-no-cover">

覆蓋來源處理：
- 移除 base.html 對 yx_modules/*.css 的載入。
- 商品頁 inventory/orders/master_order 移除 MutationObserver 與延遲重畫修復器。
- 今日異動移除多段延遲重畫。
- 客戶區移除 MutationObserver 與延遲重畫修復器。
- Service Worker / pwa 版本更新為 full-master-v6-no-readme-no-cover，並維持 no-store。

剩餘非覆蓋用途的 setTimeout/MutationObserver 掃描結果：
page_ship_master_v2.js:717: function toast(msg,kind='ok'){let box=$('yx-ship-toast');if(!box){box=document.createElement('div');box.id='yx-ship-toas
