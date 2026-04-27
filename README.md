# 沅興木業 README 單一統整版

本檔已把原本分散的 `FIX63_README.txt` 到 `FIX140_README.txt` 全部統整到這一份 README。

## 統整確認

- 原始 README 數量：78 份
- 統整範圍：FIX63 ～ FIX140
- 壓縮包內保留的 README：只有 `README.md` 一份
- 原本每一份 README 的內容都保留在下方「完整原文統整」區塊
- 程式功能檔案未因本次 README 統整而變動


---
## README 內容落實到程式核對（FIX143）

本段是針對 `FIX63_README.txt` ～ `FIX140_README.txt` 的原文內容，逐項對照目前程式檔案後加入的核對結果。這次沒有刪除功能檔，只做 README 落實核對紀錄。

### 核對結論

- 原始 README 原文段落：78 份，範圍 FIX63～FIX140。
- 壓縮包內 README 檔案：只保留 `README.md`。
- 程式落實狀態：核心功能與防舊版覆蓋架構已在程式內找到對應實作；本版另外補上 `YX.actions.editItem / deleteItem / shipItem / batchAddMaterial / batchDeleteItems` 統一商品操作入口，讓 README 中「API 操作統一」也有明確公開入口。
- 注意：README 內的部署說明、版本說明、檢查結果、覆蓋方式這類文字屬於文件/操作紀錄，不是程式邏輯，不需要再寫進 app.js 或 app.py。

### 對照表

| 項目 | 對照內容 | 狀態 |
|---|---|---|
| README 原文完整性 | 78 份 FIX63～FIX140 README 原文段落 | 已對應 |
| 單一 README | 壓縮包內只保留 README.md，沒有其他 *_README.txt | 已對應 |
| 客戶卡片模組 | YX_CUSTOMER_CARD_CONTROLLER、yx122-customer-card、data-yx-module | 已對應 |
| 商品表格 / 商品小卡模組 | selected-customer-items、yx134-product-master、yx138-row-check、raw/exact 客戶商品資料 | 已對應 |
| 今日異動模組 | /api/today-changes、summary_only、未讀、左滑/刪除邏輯 | 已對應 |
| 倉庫格子模組 | /api/warehouse/add-slot、remove-slot、return-unplaced、長按格子 | 已對應 |
| 長按操作表模組 | 客戶/倉庫長按、右鍵、操作表、封存/刪除/移區 | 已對應 |
| 拖拉換區模組 | pointer 事件、拖拉中取消長按、move region action | 已對應 |
| 批量操作模組 | 批量加材質、批量刪除、全選目前清單 | 已對應 |
| 搜尋篩選模組 | live filter / clear / recent search / customer filter markers | 已對應 |
| 首頁徽章模組 | 首頁輕量 badge、summary_only、不載入大型 app.js 的首頁腳本 | 已對應 |
| 資料來源統一 | YX.store / YX.api / YX.actions | 已對應 |
| API 操作統一 | YX.actions edit/delete/ship/move/refresh 入口 | 已對應 |
| 快取清除統一 | POST/PUT/DELETE 清快取、customer 快取清除 | 已對應 |
| 防舊版覆蓋 | YX.legacy、YX.guard、DOM ownership lock、Render Token、overwrite detector | 已對應 |
| PWA / Service Worker 版本化 | base/pwa/service-worker/manifest 同步 fix140 | 已對應 |
| OCR 顏色與區域 | blue mode / ROI / red-text avoidance through color mask | 已對應 |
| 出貨預覽與扣除 | /api/ship-preview、材積、重量、確認扣除、扣除前後 | 已對應 |
| 件數規則 | xN 及 + 段數件數計算、100x30x63 複合例 | 已對應 |
| 月份 / 0xx 排序保留 | month sort / 高度 0xx formatting | 已對應 |
| 後端主要 API | inventory/orders/master_orders/customer-items/warehouse/today-changes/admin/backup | 已對應 |

### 實際檢查方式

- JavaScript 語法檢查：`static/app.js`、`static/pwa.js`、`static/service-worker.js`。
- Python 語法檢查：`app.py`、`db.py`、`backup.py`、`ocr.py`。
- Smoke test：已升級為 FIX143 檢查基準，並檢查 README 核對版新增的統一商品 action 入口。


### FIX143 本版補強

- 新增公開統一商品操作入口：`YX.actions.editItem`、`YX.actions.deleteItem`、`YX.actions.shipItem`、`YX.actions.batchAddMaterial`、`YX.actions.batchDeleteItems`。
- 版本同步升級：`base.html`、`app.js`、`pwa.js`、`service-worker.js`、`manifest.webmanifest`、`smoke_test.py`。
- 保持單一 README：沒有新增任何 `FIXxxx_README.txt`。

### 後續維護規則

之後只維護這一份 `README.md`。新增 FIX 時，把「需求、已改程式位置、檢查結果」直接追加到此 README，不再新增多個 `FIXxxx_README.txt`。

## 原始 README 清單

- FIX63_README.txt（695 bytes，sha256: `cac74d712f84`）
- FIX64_README.txt（798 bytes，sha256: `46c84c9e0b32`）
- FIX65_README.txt（792 bytes，sha256: `f2db2c6c4442`）
- FIX66_README.txt（685 bytes，sha256: `c0e095f90aea`）
- FIX67_README.txt（730 bytes，sha256: `82db70bf2476`）
- FIX68_README.txt（868 bytes，sha256: `9692dbcd0979`）
- FIX69_README.txt（844 bytes，sha256: `b5d83e57ee52`）
- FIX70_README.txt（1365 bytes，sha256: `a2c04714c93d`）
- FIX71_README.txt（694 bytes，sha256: `ced11de49d2e`）
- FIX72_README.txt（682 bytes，sha256: `fb0d4dfe0616`）
- FIX73_README.txt（586 bytes，sha256: `b84502f4d30b`）
- FIX74_README.txt（646 bytes，sha256: `6246b8bbc93e`）
- FIX75_README.txt（873 bytes，sha256: `514db5cc3026`）
- FIX76_README.txt（1369 bytes，sha256: `cab09aeaa0af`）
- FIX77_README.txt（1648 bytes，sha256: `bbcaac7d3d53`）
- FIX78_README.txt（625 bytes，sha256: `0d25380dae67`）
- FIX79_README.txt（664 bytes，sha256: `54c8bf0899e6`）
- FIX80_README.txt（853 bytes，sha256: `649c4df9210e`）
- FIX81_README.txt（671 bytes，sha256: `8f9f734543ba`）
- FIX82_README.txt（992 bytes，sha256: `6d2fd66150de`）
- FIX83_README.txt（670 bytes，sha256: `c6564a16fc04`）
- FIX84_README.txt（665 bytes，sha256: `0e36748fe3ab`）
- FIX85_README.txt（576 bytes，sha256: `446b1b632bc6`）
- FIX86_README.txt（325 bytes，sha256: `722f4b9010f4`）
- FIX87_README.txt（618 bytes，sha256: `9e63e7f2b7e7`）
- FIX88_README.txt（769 bytes，sha256: `347fd50063dc`）
- FIX89_README.txt（686 bytes，sha256: `fd8dbc2f02db`）
- FIX90_README.txt（745 bytes，sha256: `05e81e3f1a2f`）
- FIX91_README.txt（847 bytes，sha256: `f3e7469f84a1`）
- FIX92_README.txt（506 bytes，sha256: `f0502a7f073a`）
- FIX93_README.txt（909 bytes，sha256: `81c89f52068d`）
- FIX94_README.txt（787 bytes，sha256: `fc2d5e6a1144`）
- FIX95_README.txt（535 bytes，sha256: `4d8e1cb62ddf`）
- FIX96_README.txt（847 bytes，sha256: `696eea097b59`）
- FIX97_README.txt（610 bytes，sha256: `ed54608f75ac`）
- FIX98_README.txt（637 bytes，sha256: `03aac9bfd2db`）
- FIX99_README.txt（580 bytes，sha256: `a1e6cbd627a4`）
- FIX100_README.txt（651 bytes，sha256: `8388e1d2c74a`）
- FIX101_README.txt（539 bytes，sha256: `6680a4693f87`）
- FIX102_README.txt（750 bytes，sha256: `d1e395559c25`）
- FIX103_README.txt（691 bytes，sha256: `085d732687f8`）
- FIX104_README.txt（694 bytes，sha256: `3440082ebb5a`）
- FIX105_README.txt（629 bytes，sha256: `53142440cc89`）
- FIX106_README.txt（612 bytes，sha256: `c7721bc79720`）
- FIX107_README.txt（519 bytes，sha256: `a46a895961ff`）
- FIX108_README.txt（554 bytes，sha256: `1c93a527bee5`）
- FIX109_README.txt（530 bytes，sha256: `5f916aac7c31`）
- FIX110_README.txt（1220 bytes，sha256: `8b85df3decf0`）
- FIX111_README.txt（580 bytes，sha256: `2d8962de7c3f`）
- FIX112_README.txt（624 bytes，sha256: `f1f7a3d9b263`）
- FIX113_README.txt（892 bytes，sha256: `197e75c2ed4a`）
- FIX114_README.txt（708 bytes，sha256: `4482045e5df0`）
- FIX115_README.txt（490 bytes，sha256: `bb00574e7bc4`）
- FIX116_README.txt（933 bytes，sha256: `87cd3b1bcf7d`）
- FIX117_README.txt（824 bytes，sha256: `80bdd6ce0ab8`）
- FIX118_README.txt（957 bytes，sha256: `337ce355040f`）
- FIX119_README.txt（838 bytes，sha256: `58dec89909e2`）
- FIX120_README.txt（757 bytes，sha256: `6d0730c3094d`）
- FIX121_README.txt（625 bytes，sha256: `3aa0caac38a9`）
- FIX122_README.txt（679 bytes，sha256: `569dc776f064`）
- FIX123_README.txt（1055 bytes，sha256: `2dc0c81d4592`）
- FIX124_README.txt（1039 bytes，sha256: `d95711ae3908`）
- FIX125_README.txt（1463 bytes，sha256: `a6297846f678`）
- FIX126_README.txt（941 bytes，sha256: `fd77bea95d9b`）
- FIX127_README.txt（1161 bytes，sha256: `a8898b751fb7`）
- FIX128_README.txt（1399 bytes，sha256: `80ad83c23f7f`）
- FIX129_README.txt（1095 bytes，sha256: `cd7dbca7a862`）
- FIX130_README.txt（732 bytes，sha256: `bdc34188d0b1`）
- FIX131_README.txt（1293 bytes，sha256: `25454660bbb2`）
- FIX132_README.txt（1326 bytes，sha256: `88a955b14e64`）
- FIX133_README.txt（915 bytes，sha256: `d6f3678892d4`）
- FIX134_README.txt（867 bytes，sha256: `38757bd9e3c8`）
- FIX135_README.txt（759 bytes，sha256: `b84d520ca804`）
- FIX136_README.txt（480 bytes，sha256: `dbbc1a254002`）
- FIX137_README.txt（887 bytes，sha256: `72e21aecb585`）
- FIX138_README.txt（1015 bytes，sha256: `848624fb4e2f`）
- FIX139_README.txt（1254 bytes，sha256: `7f6e1b557223`）
- FIX140_README.txt（1112 bytes，sha256: `fefb82ccafa5`）

## 完整原文統整

---

### FIX63_README.txt

```text
FIX63 穩定清理版

本版處理：
1. 清除 FIX52~FIX62 重複前端覆蓋層，避免工具列與卡片重複渲染造成版面亂跳。
2. 庫存 / 訂單 / 總單只保留一套 yx63 渲染流程。
3. 修正商品卡片重疊：固定卡片網格、強制換行、禁止內容溢出。
4. 保留原有功能：批量加材質、批量刪除、編輯、直接出貨、刪除、出貨預覽、客戶長按刪除、出貨下拉商品。
5. 件數規則修正：100x30x63=504x5+588+587+502+420+382+378+280+254+237+174 = 10 件。

覆蓋方式：解壓後整包覆蓋 GitHub 根目錄，Render 重新 Deploy。
若手機仍看到舊畫面，請清除網站資料或用無痕模式測試。
```

---

### FIX64_README.txt

```text
FIX64_mobile_fast_select

本版只做收斂修正，保留原功能：
1. 手機端庫存 / 訂單 / 總單統整表不再需要左右滑動。
   手機寬度下固定顯示：尺寸、支數 x 件數、數量。
2. 移除可見的選取框框。
   改成點「尺寸」欄即可選取 / 取消選取該筆資料。
   批量套用材質、批量刪除仍沿用原本選取邏輯。
3. 返回頁面或切換功能時減少卡頓：
   - 客戶區塊載入做防重複請求。
   - 庫存 / 訂單 / 總單卡片改成分段渲染，避免一次渲染太多卡住。
   - 補齊倉庫圖 render/search 對外函式並做短時間防重複載入。
4. 版本號已改為 fix64-mobile-fast-select，讓手機/PWA 載入新 JS/CSS。

覆蓋方式：整包覆蓋 GitHub 原專案後部署即可。
```

---

### FIX65_README.txt

```text
FIX65 duplicate convergence

本版只收斂重複初始化 / 重複載入 / 重複渲染問題，不刪除原有功能。

處理項目：
1. 舊版多段 DOMContentLoaded 初始化已加上跳過閘門，避免同一頁同時跑多次倉庫圖 / 客戶區塊初始化。
2. loadCustomerBlocks、renderWarehouse、loadInventory、loadOrdersList、loadMasterList 加上 single-flight，短時間內重複呼叫會合併成一次。
3. 客戶卡片、商品表格、卡片列表加上 DOM 去重，避免同一筆畫面重複出現。
4. confirmSubmit 加上單次送出鎖，避免連點造成重複送出。
5. 返回 / 進功能頁時暫停重動畫，減少手機卡頓。
6. 手機表格維持尺寸 / 支數x件數 / 數量三欄直接可見，選取框保持隱藏，點尺寸選取。
```

---

### FIX66_README.txt

```text
FIX66 客戶商品表格恢復 / 出貨選客戶載入商品 / 手機三欄表格 / 選取後篩選下方卡片 收斂版

修正內容：
1. 總單 / 訂單點客戶後，恢復顯示該客戶商品表格。
2. 出貨頁選取客戶後，會自動載入該客戶商品到下拉選單，並同步顯示商品表。
3. 手機端表格直接顯示：材質（綠色） / 尺寸 / 支數 x 件數，不需要左右滑。
4. 點尺寸選取後，下方商品卡片會依選取列進一步篩選；取消全部選取後恢復顯示全部。
5. 排序收斂為：材質 → 高 → 寬 → 長；同尺寸時件數多的排前面。
6. 保留原本功能，只收斂重複與顯示問題。
```

---

### FIX67_README.txt

```text
沅興木業 FIX67 倉庫圖動態格子收斂版

修正內容：
1. 移除倉庫圖每欄上方 + / - 按鈕。
2. 每個格子內新增「插入格子」「刪除格子」按鈕。
3. 取消固定 20 格限制：起始仍給 20 格，但之後插入 / 刪除會依資料庫動態顯示，不會再被補回固定 20 格。
4. 刪除格子時，格內有商品會阻擋；空格可刪，後方格號自動往前補。
5. 插入格子時，會插在目前格子的後方，後方格號自動往後移。
6. 倉庫搜尋、高亮、拖拉、格位編輯、未入倉商品列表保留。
7. 收斂舊版重複倉庫渲染邏輯，避免舊 fixed 20 / 舊 + - 邏輯蓋回來。

版本：fix67-warehouse-cell-insert-delete-dynamic
```

---

### FIX68_README.txt

```text
沅興木業 FIX68 按鈕反應與舊資料衝突收斂版

本版以 FIX67 為底，只做收斂與修正，不刪減功能：
1. 補齊缺失的前端按鈕函式，設定、出貨查詢、封存客戶、今日異動、出貨已選商品等按鈕都會有反應。
2. 所有按鈕與主選單加入即時按壓回饋，手機端不會看起來像沒反應。
3. 倉庫圖舊版欄位 + / - 與固定 20 格控制全部收斂到新規則：只保留格子內「插入格子 / 刪除格子」。
4. 舊資料若仍帶 front/back、舊欄位、舊內部備註，以目前 direct 動態格位版本為主。
5. 今日異動頁、設定頁、出貨查詢頁進入後會自動載入資料，按鈕有載入中狀態與錯誤提示。
6. 更新版本號為 fix68-button-response-conflict-converged，避免手機/PWA 吃舊快取。

覆蓋 GitHub 後重新部署即可。
```

---

### FIX69_README.txt

```text
沅興木業 FIX69 介面與按鈕總收斂版

修正重點：
1. 補齊舊檔合併後缺失的前端 helper，避免 qsa / askConfirm / setTodoButtonLoading 等缺少導致按鈕看起來沒反應。
2. 所有主要按鈕加入即時按壓回饋、處理中狀態、錯誤提示。
3. 設定頁、今日異動、出貨查詢、代辦事項、倉庫圖、出貨客戶商品選取等按鈕做最後收斂。
4. 舊版倉庫圖 + / - 和固定 20 格控制全部退役，只保留格子內「插入格子 / 刪除格子」。
5. 出貨加入選取商品 / 加入全部商品後會立即刷新已選商品與預覽。
6. 手機端按鈕、表格、工具列避免橫向溢出與卡住。
7. 版本號更新為 fix69-ui-button-final-convergence，避免 PWA/手機吃到舊快取。

覆蓋方式：
整包覆蓋 GitHub 後重新部署 Render。
```

---

### FIX70_README.txt

```text
FIX70 最終衝突收斂版

本版從 FIX69 往上收斂，不刪功能，只處理仍可能造成按鈕重複觸發、舊資料衝突與手機端卡頓的問題。

修正重點：
1. 出貨客戶商品按鈕改成唯一最新路由：重新載入 / 加入選取商品 / 整個加入，不再被舊版 document click 重複觸發。
2. 倉庫圖格子內「插入格子 / 刪除格子」改成最優先攔截，舊版 +-、固定 20 格控制繼續完全退役。
3. 管理員封鎖、備份還原、封存客戶還原、今日異動刪除等動態按鈕改成唯一處理，不會同時跑 FIX68/FIX69 舊 handler。
4. loadCustomerBlocks / renderWarehouse / renderCustomers / loadShipCustomerItems66 / 今日異動 / 代辦 / 出貨查詢 / 設定資料載入全部加上最後一層 single-flight 收斂，降低返回與進功能頁卡頓。
5. 確認送出加最後一層單次鎖，避免連點或舊 handler 衝突造成重複送出。
6. 內建 yx70SmokeCheck，會掃描目前頁面 onclick / onsubmit 是否有缺函式，避免按鈕按下完全無反應。
7. PWA / base.html / service-worker 版本更新為 fix70-final-conflict-convergence，避免手機吃舊快取。
8. manifest 捷徑 URL 修正為實際路由 /inventory、/warehouse、/today-changes。

覆蓋方式：
整包解壓後直接覆蓋 GitHub 專案，Render 重新部署即可。
```

---

### FIX71_README.txt

```text
FIX71 修改內容

1. 庫存 / 總單 / 訂單統整表：材質欄縮小，材質文字固定綠色顯示。
2. 倉庫圖：取消格子內「插入格子 / 刪除格子」兩顆按鈕，改為長按格子後跳出操作選單，可插入、刪除或編輯格子。
3. 客戶資料：補回 fillCustomerForm，點選右側客戶卡片會正確帶入左側客戶名稱、電話、地址、特殊要求、常用材質、常用尺寸與區域。
4. 總單：點選客戶後保留功能完整的統整表，隱藏會重複顯示的客戶商品表，避免總單出現兩張重複表格。
5. 保留原有 API、批量加材質、批量刪除、選取篩選、拖曳倉庫商品與出貨功能。
```

---

### FIX72_README.txt

```text
FIX72 修正內容

1. 倉庫圖格子不再顯示「長按操作」綠色提示文字，但保留長按格子開啟：編輯 / 插入格子 / 刪除格子。
2. 修正「確認送出」被舊的 busy 鎖互相擋住，導致出貨按下去沒反應的問題。
3. 出貨確認送出後會先顯示出貨預覽，包含：商品、件數、長度計算、材積計算、可扣來源、商品倉庫圖位置。
4. 出貨預覽新增重量輸入，會自動計算「材積 × 重量」。
5. 預覽確認後再按「確認扣除」才會真正扣總單 / 訂單 / 庫存，並顯示扣除摘要。
6. base / pwa / service-worker 版本號已更新到 FIX72，降低舊快取干擾。
```

---

### FIX73_README.txt

```text
FIX73 修正內容

1. 出貨/送出解析補強：
   - 63x14x73=1320x2+925 會判定為 3 件。
   - 80x20x73=990+947 會判定為 2 件。
   - 有 xN 的段落算 N 件，單獨支數段落算 1 件。

2. 材積計算修正：
   - 高度輸入 073、06、05 這類前導 0 不會被刪除。
   - 出貨預覽材積計算時，06 會依 0.6、073 會依 0.73、006 會依 0.06 計算，不會先刪掉前導 0。

3. 快取版本更新：
   - base.html / app.js / pwa.js / service-worker.js 版本更新到 FIX73。

其他功能與介面沿用 FIX72，不刪除既有功能。
```

---

### FIX74_README.txt

```text
FIX74 修正內容

1. 修正 0xx 高度不可被刪除：073、063、006 會保留顯示與儲存，不會被轉成 73 / 63 / 6。
2. 修正客戶商品 / 總單商品編輯失敗：/api/customer-item 現在支援 inventory、orders、master_order、master_orders 與中文來源名稱。
3. 出貨預覽取消「長度計算」欄位與長度合計，只保留件數、材積、可扣來源、倉庫圖位置與重量計算。
4. 件數規則維持：右側單獨支數不論 1 位、2 位、3 位、4 位數，只要後面沒有 x幾件，一律判定為 1 件；有 xN 才算 N 件。
5. 快取版本更新為 fix74-preserve-0xx-no-length。
```

---

### FIX75_README.txt

```text
FIX75：卡片按鈕、倉庫回退與支數計算修正版

1. 修正庫存 / 訂單 / 總單卡片「編輯、直接出貨、刪除」按鈕：改走各來源專用 API，避免舊 customer-item 共用 API 衝突造成失敗。
2. 倉庫圖格位選取商品後，自動把「加入數量」填成該商品尚未錄入倉庫圖的全部數量。
3. 修正「加入格位」按下沒反應：保留商品來源摘要、客戶與完整數量，加入後會提示並渲染到格位清單。
4. 長按倉庫格子新增「返回上一步（回到未錄入倉庫圖）」；會清空該格商品，讓商品重新回到尚未錄入倉庫圖清單。
5. 將畫面殘留的「長度計算」文字改成「支數計算」。
6. 保留 0xx 高度格式，例如 073 / 063 / 006 不會被前端編輯流程刪除。
7. 快取版本更新為 fix75-card-warehouse-support-return。
```

---

### FIX76_README.txt

```text
FIX76 修正版內容

1. 相同「尺寸 + 材質」送出前會先詢問是否合併
   - 庫存 / 訂單 / 總單送出前會呼叫 /api/duplicate-check。
   - 偵測到相同尺寸 + 材質時，會列出舊資料與本次新增資料。
   - 按「確認合併送出」才會合併；取消則不送出。
   - 總單以「相同客戶 + 相同尺寸 + 相同材質」為合併條件。

2. 後端合併邏輯改為尺寸 + 材質
   - save_inventory_item / save_order / save_master_order 已改成用尺寸 + 材質合併。
   - 合併時會保留並整合等號右側支數，例如 294x2 + 294x3 會合併為 294x5。

3. 倉庫圖儲存「格位參數錯誤」修復
   - 前端儲存格位時補上 column_index。
   - 兼容舊 state.currentCell.column，避免 API 收到欄位 0。

4. 出貨重複商品與超過總單修復
   - 客戶商品清單加入商品時，同尺寸商品已存在於商品資料，就會阻止重複加入。
   - 後端出貨預覽 / 確認扣除都會先把同尺寸 + 材質合併計算總數。
   - 若本次出貨數量超過該客戶總單數量，會直接禁止並顯示「超過總單」。
   - 例：總單 140x30x125=294x2，出貨改成 140x30x125=294x3，會禁止送出。

5. 圖三出貨下方重複紅色卡片已隱藏
   - #ship-selected-section 已隱藏，不影響商品資料與出貨預覽功能。
```

---

### FIX77_README.txt

```text
FIX77 最終收斂修正版

本版只修正衝突與穩定性，不刪除原有功能。

已修正：
1. 前端確認送出流程收斂
   - 最後統一由 FIX77 master confirmSubmit 接管。
   - 庫存 / 訂單 / 總單 / 出貨 不再各自跑舊流程。
   - 防止送出中重複點擊。

2. 相同尺寸 + 材質合併詢問
   - 改用真正送出的商品資料檢查，不只讀 OCR 文字框。
   - 會列出舊資料與本次新增資料。
   - 按確認後才會合併送出。

3. 出貨流程穩定化
   - 統一流程：確認送出 → /api/ship-preview → 出貨預覽 → 確認扣除 → /api/ship。
   - 保留超過總單禁止出貨。
   - 預覽顯示扣總單 / 訂單 / 庫存、倉庫位置、材積、重量計算。

4. 倉庫儲存修正
   - 儲存格位時一定帶 zone / column_index / slot_number。
   - 儲存後重新載入倉庫圖，避免看起來沒反應。

5. 長按插入 / 刪除格子修正
   - 後端改成整欄安全重排，避免 UNIQUE 唯一索引衝突。
   - 插入後格號往後順延；刪除後格號往前補。

6. SQLite 本機初始化修正
   - 修掉 SQLite 不支援 ALTER TABLE ADD COLUMN IF NOT EXISTS 的問題。
   - 本機 / 手機測試不會因此初始化失敗。

7. 商品數量解析補強
   - 支援 Lx50x083=19件。
   - 支援 179x___=131x4 自動承接上一筆寬高。
   - 支援 100x30x63=504x5+588+587+502+420+382+378+280+254+237+174 這類多長度包裝依段數算 10 件。

檢查結果：
- Python 語法檢查 OK。
- JavaScript 語法檢查 OK。
- tools/smoke_test.py OK。
- SQLite init_db + 倉庫插入 / 刪除格子測試 OK。
```

---

### FIX78_README.txt

```text
FIX78 Render PostgreSQL 啟動修正版

修正內容：
1. 修正 FIX77 在 Render PostgreSQL 初始化時誤執行 SQLite PRAGMA 的錯誤。
2. warehouse_cells 已存在且不是舊 schema 時，改用 PostgreSQL 相容的 ALTER TABLE ... ADD COLUMN IF NOT EXISTS。
3. 保留 FIX77 的全部功能：送出流程收斂、出貨預覽、防超總單、合併詢問、倉庫儲存、插入/刪除格子安全重排。

部署方式：
直接整包覆蓋 GitHub，Render 重新部署即可。

已檢查：
- app.py / db.py / backup.py / ocr.py Python 語法 OK
- static/app.js JavaScript 語法 OK
- tools/smoke_test.py OK
```

---

### FIX79_README.txt

```text
FIX79 Render PRAGMA 啟動錯誤最終修正版

修正重點：
1. 修正 Render PostgreSQL 啟動時誤跑 SQLite PRAGMA 的保護邏輯。
2. DATABASE_URL 會先 strip 並使用 lower 判斷 postgres:// / postgresql://。
3. 新增 _backend_is_postgres / _table_columns / _add_column_if_missing，補欄位時依實際資料庫後端選擇 information_schema 或 SQLite PRAGMA。
4. 將 db.py 內直接 PRAGMA table_info 的補欄位流程集中到安全 helper，避免 PostgreSQL 再吃到 PRAGMA。
5. 保留 FIX77/FIX78 所有功能，不刪功能。

部署方式：
整包覆蓋 GitHub 後，Render 重新部署。
Start Command 維持：gunicorn app:app
```

---

### FIX80_README.txt

```text
FIX80 修正版

本版基於 FIX79，保留既有功能，新增 / 修正：
1. 訂單頁北中南客戶只顯示有建立訂單的客戶，不再顯示只有總單的客戶。
2. 客戶名稱輸入框支援第一字自動補完整客戶名；重複開頭時顯示下拉選單。
3. 出貨若從 A 客戶選商品加入後又改成 B 客戶，送出前會詢問是否向 A 客戶借貨；確認後扣 A 的總單 / 訂單，出貨紀錄記在 B 並標註借貨。
4. 倉庫格位編輯新增批量加入：預設三筆，可增加更多；第一筆標示後排、第二筆中間、第三筆前排。
5. 今日異動固定 24 小時制，只顯示今日進貨、出貨、新增訂單；未錄入倉庫圖統計庫存 / 訂單 / 總單全部尚未加入數量。

檢查：
- Python py_compile OK
- static/app.js node --check OK
- tools/smoke_test.py OK
```

---

### FIX81_README.txt

```text
FIX81 唯一母版收斂版

本版重點：
1. 前端所有容易互相覆蓋的入口集中到 window.YX_MASTER。
2. confirmSubmit、saveWarehouseCell、loadCustomerBlocks、renderCustomers、loadTodayChanges、openWarehouseModal、renderWarehouseCellItems 都由 FIX81 母版最後安裝。
3. pageshow / DOMContentLoaded 後會重新安裝母版，避免舊 FIX 事件再次覆蓋。
4. 訂單頁北中南只顯示有訂單客戶、客戶名稱自動補全、借貨出貨、格位批量加入、今日異動 24 小時制都保留。
5. ocr.py 重複 helper 已改名成 legacy，正式 helper 只保留最後版本。

Render Start Command 維持：gunicorn app:app
```

---

### FIX82_README.txt

```text
FIX82 出貨預覽清楚版 + 來源比對扣除 + 倉庫格位批量母版

修正內容：
1. 出貨預覽改成清楚版，顯示材積算式、材積合計、重量輸入與總重自動計算。
2. 出貨商品若從總單商品加入，預覽與扣除只比對/扣除總單。
3. 出貨商品若從訂單商品加入，預覽與扣除只比對/扣除訂單。
4. 若該客戶沒有總單/訂單商品，出貨下拉會直接載入庫存全部商品，選取後比對/扣除庫存。
5. 出貨完成會顯示扣除前全部數量與扣除後剩餘數量。
6. 格位編輯移除舊的加入商品/加入數量與加入格位/儲存格位流程。
7. 格位批量加入按下後會直接儲存格位。
8. 批量加入按下「增加批量」會保留前面已選好的商品與數量。
9. 倉庫格子內改成只顯示客戶名稱與總件數；詳細資料移到格位編輯上方，並顯示後排/中間/前排。
10. 保留 FIX81 唯一母版並由 FIX82 更新 YX_MASTER 入口。
```

---

### FIX83_README.txt

```text
FIX83 QA穩定修正版
1. 修正出貨從清單加入商品時，若商品文字沒有 = 算式，會被當成 1 件的問題；現在會保留原商品數量。
2. 修正從庫存商品出貨後換客戶時，不應跳借貨確認的問題；只有總單/訂單跨客戶才會詢問借貨。
3. 出貨確認送出仍顯示材積算式、重量→總重、扣除前/扣除後。
4. 倉庫格位舊的加入商品/加入數量/加入格位/儲存格位已從畫面母版隱藏，只保留批量加入自動儲存。
5. 防止舊版 yx80/yx81 批量面板與 yx82 面板重複出現。
6. 增加批量會保留已選商品；批量加入會鎖按鈕避免重複送出。
```

---

### FIX84_README.txt

```text
FIX84 送出刷新 + 月份排序修正版

修正內容：
1. 送出完成後會強制重新讀取客戶區塊、客戶商品明細，並自動打開剛送出的客戶，避免顯示還停在舊資料。
2. 新增月份排序規則：若商品左側有月份，例如 12月132x50x06=294x8，排序改為 月份 > 高 > 寬 > 長，由小到大。
3. 前端送出前會先將商品資料文字框按月份規則重新排序，再送進後端。
4. 後端商品顯示與 customer-items 明細排序同步支援月份前綴。
5. OCR 解析輸出也支援月份前綴，會保留 12月 / 8月 這類標記。

部署：
Render Start Command 維持：gunicorn app:app
```

---

### FIX85_README.txt

```text
FIX85 月份排序與月份格式美化修正版

修正內容：
1. 商品尺寸有月份前綴時，前端表格改成真正依「月份 → 高 → 寬 → 長」由小到大排序。
2. 修正舊前端排序把「9月132x50x06」的長度誤判成 9132，導致只按高/寬分組的問題。
3. 客戶明細、總單/訂單/庫存統整表、出貨商品下拉來源排序同步修正。
4. 月份商品格式美化：月份以小標籤顯示，尺寸用「132 × 50 × 06」形式呈現。
5. 保留 FIX84 的送出刷新與月份後端支援，不刪除既有功能。
```

---

### FIX86_README.txt

```text
FIX86：修復 FIX85 月份格式美化造成瀏覽器 STATUS_STACK_OVERFLOW。

修正：
1. 移除會反覆包覆月份標籤的全頁 MutationObserver。
2. 月份排序保留：月份 → 高 → 寬 → 長，由小到大。
3. 月份格式美化改成安全版，只裝飾尺寸欄位。
4. 保留前面版本功能。
```

---

### FIX87_README.txt

```text
FIX87 最終巡檢穩定版

修正內容：
1. 快取版本升級到 fix87，避免手機/PWA/瀏覽器吃到舊 app.js。
2. 後端所有回應統一 no-store，API 也不快取。
3. 前端確認送出收斂成最後安全母版，避免 FIX84/FIX86 包裝鏈太深。
4. 月份排序改為安全手動觸發，不再依賴 DOM 反覆監聽。
5. 月份顯示保留美化標籤：月份 → 高 → 寬 → 長。
6. 送出成功後自動重載客戶資料與月份表格。
7. GET /api 請求強制 no-store，返回頁與 PWA 不再顯示舊資料。

Render Start Command：gunicorn app:app --bind 0.0.0.0:$PORT
```

---

### FIX88_README.txt

```text
沅興木業 FIX88 最終巡檢修正版

修正內容：
1. 修正 smoke_test 仍檢查舊 FIX81/FIX75 版本字串，導致巡檢失敗。
2. 將 base.html / pwa.js / service-worker.js / manifest 版本升為 fix88-final-qc-stable，避免手機與 PWA 吃舊快取。
3. 新增 FIX88 前端穩定守門：防止舊 FIX84 / FIX86 / FIX65 / FIX70 延遲 installer 再次包覆 confirmSubmit。
4. 確認送出流程保留唯一最後入口，送出後強制重讀資料並套用月份排序。
5. 倉庫格位編輯隱藏舊版單筆加入/儲存入口，只保留批量加入格位自動儲存流程。
6. GET /api 再次加強 no-store。
7. 移除 __pycache__，避免不必要檔案進入部署包。

Render Start Command：
gunicorn app:app --bind 0.0.0.0:$PORT
```

---

### FIX89_README.txt

```text
FIX89 出貨來源與倉庫批量穩定修正版

1. 出貨預覽顯示實際扣除來源：扣除總單 / 扣除訂單 / 扣除庫存。
2. 手動輸入商品若沒有指定來源，後端會依序自動比對：總單 -> 訂單 -> 庫存。
3. 手動輸入沒有材質時，出貨比對改用尺寸找貨，避免明明有貨卻顯示 0。
4. 確認扣除後顯示扣除前與扣除後剩餘數量，並標示實際扣除來源。
5. 倉庫格位批量加入改用穩定商品 key，不再因增加批量或重新載入後選到錯的商品。
6. 批量不加入列數量預設 0；選到商品才自動帶入剩餘數量。
7. 保留 FIX88 全部快取與母版收斂穩定修正。
```

---

### FIX90_README.txt

```text
沅興木業 FIX90 出貨預覽失敗修正版

修正內容：
1. 修正出貨預覽遇到沒有材質的手動商品時，SQLite / PostgreSQL 查詢 customer_name 的 SQL 字串錯誤，避免整個預覽顯示「出貨預覽失敗」。
2. 修正從客戶商品清單加入商品後，後端 normalize 會吃掉 source_preference / source / deduct_source，導致總單 / 訂單 / 庫存來源判斷錯。
3. 修正確認扣除時 source_pref 分支錯誤，避免指定訂單 / 庫存來源時 auto_source 未定義造成出貨失敗。
4. 保留 FIX89 所有功能：清楚出貨預覽、實際扣除來源、倉庫批量加入、月份排序與快取版本。

部署：
Render Start Command 建議：gunicorn app:app --bind 0.0.0.0:$PORT
```

---

### FIX91_README.txt

```text
FIX91 唯一倉庫批量母版收斂版

修正內容：
1. 倉庫格位編輯只保留一個批量加入商品面板。
2. 移除舊版 yx80 / yx81 / yx82 / yx83 / yx89 重複批量面板。
3. 保留使用者要的橫向批量加入樣式：後排 / 中間 / 前排 + 商品下拉 + 數量。
4. 批量加入格位會直接儲存，不再需要下方舊版加入格位 / 儲存格位。
5. 增加批量不會清掉前面已選好的商品。
6. 使用穩定商品 key，避免商品順序變動導致選錯商品。
7. openWarehouseModal / refreshWarehouseBatchPanel / renderWarehouseCellItems / saveWarehouseCell 最後入口改由 FIX91 單一母版接管。
8. PWA / service worker / base.html 版本更新，避免手機吃舊版快取。

保留 FIX90 的出貨預覽、來源扣除、材積算式、重量計算、月份排序等功能。
```

---

### FIX92_README.txt

```text
FIX92 倉庫拖拉搬移最前排修正版

修正內容：
1. 倉庫圖格子內商品可直接拖拉到別格。
2. 目標格已有商品時也允許放入。
3. 拖入目標格後會標示並顯示在「前排」。
4. 拖拉時會帶客戶名稱，避免同尺寸不同客戶搬錯。
5. 後端 /api/warehouse/move 支援 placement_label=前排。
6. 保留 FIX91 唯一倉庫批量母版功能。

部署方式：整包覆蓋 GitHub，Render Start Command 維持 gunicorn app:app --bind 0.0.0.0:$PORT
```

---

### FIX93_README.txt

```text
# FIX93 手機版客戶區塊 / 批量長按 / 今日異動卡片 / 未入倉統計修正版

修正項目：
1. 手機端訂單 / 總單北中南客戶改成同一橫排，可左右滑動；點客戶後自動跳到統整明細。
2. 總單統整的尺寸、支數 x 件數、數量欄都可以點選批量。
3. 商品卡片尺寸、支數、數量放同一排並放大顯示，隱藏「客戶：xxx」。
4. 手機端倉庫圖 1~6 欄可以橫向滑動。
5. 倉庫高亮按鈕文字改為「同客戶 / 未入倉 / 清除高亮」並固定同排。
6. 未入倉統計改顯示庫存 + 訂單 + 總單未入倉總件數，點擊可看全部未入倉明細。
7. 今日異動取消上方篩選按鈕，改為點卡片切換；未點卡片時顯示全部。
8. 批量加材質、套用材質、批量刪除、重新整理按鈕收斂，改為選取後長按跳出批量操作；材質新增「尤加利」。
```

---

### FIX94_README.txt

```text
FIX94 修正內容
1. 庫存 / 訂單 / 總單商品卡片固定新版顯示：第一排顯示「材質」與「數量」，第二排顯示「132x40x05 = 459x9」格式。
2. 商品卡片關鍵文字全部強制粗體，並固定卡片結構，降低文字換行造成的跳動。
3. 今日異動保留新版直列卡片與手動「刷新」按鈕。
4. 倉庫圖未入倉改成手動刷新：顯示「未入倉：按刷新」，按「刷新未入倉」才重新抓數量與明細。
5. 加入 available-items 30 秒快取節流，避免舊函式重複抓未入倉造成頁面卡頓或亂跳。
6. 倉庫格位同格同客戶同材質顯示改為「客戶CNF　1+1件」格式。
7. 收斂 FIX93 的未入倉自動重算：返回主頁或切換頁面不再主動重抓未入倉數量。
```

---

### FIX95_README.txt

```text
FIX95 收斂重點：
1. 倉庫圖 renderWarehouse / renderWarehouseZones 收斂成唯一新版渲染。
2. 倉庫圖不再自動抓未入倉數量，改成「刷新未入倉」手動刷新。
3. 今日異動收斂成唯一新版直列卡片，舊篩選列與舊控制隱藏。
4. 今日異動刷新改成手動按「刷新」，避免重複計算導致跳版。
5. 同一格同客戶改成「客戶 1+1件」顯示。
6. 保留原本 API、儲存格位、長按增刪格位、搜尋、高亮、出貨/訂單/總單/庫存等功能。
```

---

### FIX96_README.txt

```text
FIX96 硬收斂版

本版重點：
1. 倉庫圖固定唯一新版 renderWarehouse96 / renderWarehouseGrid96。
2. 今日異動固定唯一新版 loadTodayChanges96，保留直列卡片與手動刷新。
3. 舊版 loadTodayChanges80/93/95、renderWarehouse82/95、LegacyA/LegacyB 的計時觸發已在 app.js 最前面阻擋。
4. 停用舊版全頁 MutationObserver，避免返回主頁、打開功能頁時重複重畫。
5. 未入倉數量改為手動刷新；非 yx_manual=1 的 available-items 自動抓取會被攔截。
6. 商品卡固定粗體，第一排顯示材質 / 數量，第二排顯示尺寸 =支數x件數。
7. 同格同客戶以「客戶/條件  1+1件」聚合顯示。

注意：為了保留現在所有功能，舊補丁區塊未大幅重寫後端與其他功能，但會跳舊版的前端入口已收斂到 FIX96 master。
```

---

### FIX97_README.txt

```text
FIX97 修正內容
1. 庫存 / 訂單 / 總單：點選上方統整表列後，下方卡片只顯示已選商品；可一鍵清除篩選。
2. 倉庫圖：新版格子長按固定顯示完整格子操作：編輯、查看格位、插入格子、刪除格子、取消。
3. 倉庫格位彈窗：清除 yx80/yx81/yx82/yx83/yx89 舊版重複詳細表 / 批量表，只保留唯一新版面板。
4. 今日異動：標籤與數字加粗固定；舊版今日異動卡片會被直接移除，只保留新版直列卡片。
5. 舊今日異動入口重新導向到目前 loadTodayChanges，避免跳回舊版格式。
```

---

### FIX98_README.txt

```text
FIX98 唯一版本收斂修正

1. 倉庫舊版「格位詳細資料」大表已被停用，不再先跳舊表再跳新版。
2. 格子長按功能固定為唯一新版：編輯、查看格位、返回未入倉、插入格子、刪除格子、取消。
3. 格位詳細資料小卡加入前排 / 中間 / 後排註記，並保留返回未入倉功能。
4. 未入倉不再顯示「刷新未入倉」按鈕；改為點擊未入倉標籤查看列表，長按未入倉標籤才刷新數量。
5. 今日異動小卡固定顯示四張：進貨、出貨、新增訂單、未入倉；標籤與數字加粗，清除舊刷新與舊格式跳版。
```

---

### FIX99_README.txt

```text
FIX99 唯一版本收斂：
1. 今日異動上方小卡與舊刷新列移除，功能改到下方標籤：標籤顯示數量、點擊篩選、長按刷新。
2. 倉庫格位彈窗只保留新版：格位詳細資料 + 搜尋已錄入商品 + 前/中/後批量加入 + 備註。舊圖二簡化彈窗入口已覆寫清除。
3. 未入倉不再用刷新按鈕：點擊未入倉標籤看全部未入倉，長按才刷新。
4. 所有登入後頁面右上角加入「復原上一步」按鈕，呼叫 /api/undo-last 並刷新當前頁面。
5. base.html 快取版本更新為 fix99。
```

---

### FIX100_README.txt

```text
FIX100_CACHE_TOGGLE_UNPLACED

本版在 FIX99 基礎上收斂以下行為：
1. 今日異動標籤長按刷新後，結果會存到 localStorage，之後只讀保存結果，直到下次長按手動刷新。
2. 倉庫圖未入倉標籤長按刷新後，結果會存到 localStorage，之後只讀保存結果，直到下次長按手動刷新。
3. 倉庫圖未入倉標籤點擊第一次展開已保存清單，第二次點擊收起。
4. 點 A 區 / B 區 / 全部會先收起未入倉清單，再切換區域。
5. 保留 FIX99 的唯一今日異動標籤、唯一倉庫彈窗、復原上一步功能。

快取版本：fix100-cache-toggle-unplaced
```

---

### FIX101_README.txt

```text
FIX101：倉庫格子點擊直接開啟格位編輯

修正內容：
1. 點擊倉庫任一格子，直接開啟該格子的新版格位編輯彈窗。
2. 彈窗固定順序：格位詳細資料 → 搜尋已錄入商品 → 批量加入商品 → 格位備註。
3. 上方格位詳細資料會顯示目前點擊格子內的前排／中間／後排商品資料。
4. 長按格子仍保留增刪格子、返回未入倉等操作，不影響既有功能。
5. 已更新 cache 版本為 fix101-direct-cell-editor，避免瀏覽器吃舊版。
```

---

### FIX102_README.txt

```text
FIX102：最終格位彈窗與格子顯示收斂

處理內容：
1. 長按格子的舊「編輯此格 / 查看格位資料」兩個入口已移除，只保留返回未入倉、插入格子、刪除格子、取消。
2. 點格子只開啟唯一新版格位編輯彈窗，並強制依照點選格子即時讀取該格資料，不再沿用上一格資料。
3. 彈窗順序固定：格位詳細資料 → 搜尋已錄入商品 → 批量加入商品 → 格位備註。
4. 倉庫格子文字統一大字體，移除大/小字混用。
5. 格子已簡化顯示為：第一排「第01格 客戶名」，客戶名紅色；第二排「10+2+3    15件」。
6. base.html 版本號更新為 fix102-final-cell-modal-slot-text，避免瀏覽器吃舊快取。
```

---

### FIX103_README.txt

```text
FIX103：今日異動自動刷新 + 倉庫格位唯一彈窗 + 格子顯示收斂

1. 今日異動「進貨 / 出貨 / 新增訂單 / 未錄入倉庫圖」進頁自動刷新。
2. 今日異動標籤取消長按刷新，只保留點擊篩選。
3. 移除 FIX101 舊格位彈窗控制，避免點格子後被舊函式覆蓋。
4. 倉庫格子顯示收斂為：第01格 客戶；第二排為 10+2+3 15件。
5. 客戶名為紅色，總件數為紅色，明細加總為黑色。
6. 點擊每一格都依該格 zone/欄/格重新讀取資料，不沿用前一格資料。
7. 格位彈窗固定唯一順序：格位詳細資料 → 搜尋已錄入商品 → 批量加入商品 → 格位備註。
```

---

### FIX104_README.txt

```text
FIX104 Render端口穩定啟動版

本版只修 Render 部署啟動/端口偵測，不改 FIX103 的前端功能。

修正內容：
1. 新增 gunicorn.conf.py
   - 強制 bind = 0.0.0.0:$PORT
   - 即使 Render 後台 Start Command 仍是 gunicorn app:app，也會讀取此設定。
2. Procfile 改為 gunicorn app:app --config gunicorn.conf.py
3. render.yaml 改為同一套啟動命令，並加入 healthCheckPath: /health
4. Python 固定 3.11.10，WEB_CONCURRENCY 固定 1，timeout 120 秒。

Render 後台建議：
Start Command 請填：gunicorn app:app --config gunicorn.conf.py
Build Command 請填：pip install -r requirements.txt
Root Directory 請留空或填專案根目錄。
```

---

### FIX105_README.txt

```text
FIX105：倉庫格位批量下拉與格內資料同步版

處理內容：
1. 格位編輯彈窗的未入倉下拉選單已接上 /api/warehouse/available-items。
2. 點格子時會依照目前點擊的格位重新讀取該格資料，不沿用前一格資料。
3. 格內原本的後排 / 中間 / 前排資料會自動帶入下方批量加入表。
4. 新增批量從第 4 筆開始，不會覆蓋原本後中前資料。
5. 批量加入格位改成整格同步儲存：保留原本格內資料，並加入新選的未入倉商品。
6. 保留 FIX104 的 Render 端口穩定啟動設定。
7. app.js 已通過 node --check。
```

---

### FIX106_README.txt

```text
FIX106 倉庫未入倉下拉全接通 / 唯一格位彈窗收斂版

本版重點：
1. 格位編輯的下拉選單改為「全部未入倉商品」來源，不再只抓錯誤或空白選項。
2. A 倉、B 倉每一格點開後都會重新讀取該格資料，避免沿用前一格資料。
3. 下方批量表會自動帶入格內原本後排 / 中間 / 前排資料。
4. 新增批量從第 4 筆開始。
5. 舊 yx91 / yx97 / yx99 / yx102 / yx103 / yx105 的格位詳細與批量面板會被清除，只保留 FIX106 單一主流程。
6. 保留 FIX104 Render 端口穩定啟動設定與目前全部功能。
```

---

### FIX107_README.txt

```text
FIX107 格子顯示收斂版

修正項目：
1. 倉庫格子顯示不再顯示 FOB、CNF、FOB代付。
2. 倉庫格子顯示不再顯示 132x32x12 等尺寸資訊。
3. 第01格這一排右側顯示該格總件數，紅色字體。
4. 第二排只顯示該格各筆件數加總式，例如 10+2+3。
5. 格子顯示函式收斂到 FIX107 最新渲染格式，舊版小字/尺寸/來源格式不再輸出。
6. 保留 FIX106 的未入倉下拉、格內資料同步、批量第4筆開始、Render 端口穩定設定。
```

---

### FIX108_README.txt

```text
FIX108：未入倉來源接通 + AB倉格子顯示最終收斂版

1. 修正「找不到可入倉來源」導致批量加入卡住。
2. 未入倉下拉只讀後端全部未入倉 API，避免今日異動/舊快取混入錯誤來源。
3. AB倉所有格子顯示統一：第一排左邊單數字格號、右邊所有公司名；第二排左邊件數算式、右邊紅字總件數。
4. 格子內不顯示 FOB/CNF/FOB代付，不顯示尺寸。
5. 保留 FIX107 / FIX106 現有格位編輯、後中前帶入、第4筆開始新增、Render 端口設定。
```

---

### FIX109_README.txt

```text
FIX109 目標函式收斂版

處理範圍只限使用者要求過的函式區：
1. 未入倉下拉選單固定使用 /api/warehouse/available-items?yx_manual=1&yx109=1，避免舊 fetch guard 擋掉資料。
2. 舊倉庫渲染 / 格位彈窗 / 批量面板入口導向目前新版。
3. 清除舊格位詳細資料面板、舊批量表、舊手動刷新按鈕 DOM。
4. 保留 FIX108 的 AB 倉格子顯示格式：第一排單格號 + 公司名，第二排數量式 + 紅字總件數。
5. 沒有碰未要求的其他功能。
```

---

### FIX110_README.txt

```text
FIX110 網頁開啟速度優化版

本版只處理開頁緩慢與重複請求問題，不更動 FIX109 既有介面功能。

修正內容：
1. static/app.js、static/style.css、icon、manifest 改成版本號長快取。
   - 以前所有靜態檔都 no-store，每次開頁都重新下載，會造成手機開頁慢。
   - 現在使用 ?v=fix110-performance-cache 控制版本，更新版本才會重新抓檔。
2. HTML / API 保持 no-store。
   - 頁面資料仍即時，不會吃舊資料。
3. Service Worker 改成快取 static 檔案。
   - App JS / CSS / PWA 檔 / 圖示可快取。
   - API 與頁面仍即時抓取。
4. PWA 不再每次開頁都 reg.update()。
   - 改成最多 6 小時檢查一次，減少每頁開啟時的網路負擔。
5. app.js 新增 GET API 同時重複請求合併。
   - 多個舊函式同時抓同一支 API 時，只送出一次，其他共用回應。
   - 減少開頁時 API 風暴與卡頓。
6. base.html 移除 HTML meta no-cache。
   - 由 Flask header 正確控管快取，避免瀏覽器每次強制重抓所有資源。

保留內容：
- 保留 FIX109 的倉庫、格位、未入倉、今日異動所有功能。
- 沒要求的 UI 與業務邏輯不改。
```

---

### FIX111_README.txt

```text
FIX111 開功能與返回主頁速度優化版

處理項目：
1. 首頁/登入頁不再載入大型 app.js，返回主頁速度變快。
2. 點功能頁/返回主頁時，提前取消舊版排隊 timers，避免離頁前重畫造成卡頓。
3. 內部選單/返回連結改成快速導頁，阻止舊 document click handlers 重複執行。
4. GET API 短時間快取與合併，減少開功能頁時同一 API 被舊函式重複打。
5. 倉庫、今日異動、客戶區、出貨查詢、代辦等重複 render 進行合併節流。

保留 FIX110 / FIX109 的現有功能。
```

---

### FIX112_README.txt

```text
FIX112 修正內容
1. 訂單 / 總單送出後，北中南客戶卡片改用最新資料重新載入，點開會直接用 customer_uid + name 讀取該客戶商品，避免送出後顯示客戶但商品為空。
2. 北中南客戶卡片支援桌機與手機長按 / 右鍵刪除；有商品或出貨歷史時自動封存，保留資料。
3. 倉庫格子顯示收斂：第一排只顯示單數字格號 + 客戶名；第二排顯示件數加總式 + 右側紅字總件數。
4. 同一格如果有不同客戶，客戶名用 xx/xx/xxx 顯示並改紅字。
5. 未指定客戶在倉庫格子內統一顯示為「庫存」。
```

---

### FIX113_README.txt

```text
FIX113 客戶拖拉移動 / 長按右鍵刪除 / 封存客戶刪除按鈕

修正內容：
1. 訂單、總單、出貨與客戶資料頁的北區/中區/南區客戶卡片可拖拉移動區域。
2. 手機長按、電腦右鍵客戶卡片會打開新版客戶操作選單。
3. 新版客戶操作選單提供：打開客戶商品、移到北/中/南、封存客戶、刪除客戶。
4. 停用舊版逐卡長按與 FIX112 長按彈窗，避免重複彈窗或刪除失效。
5. 封存客戶視窗新增「刪除客戶」按鈕，並保留「還原」。
6. 後端 DELETE /api/customers/<name>?force=1 支援強制刪除客戶資料卡；商品與出貨歷史保留，避免誤刪原始資料。
7. 未加入全頁 MutationObserver，避免重新造成返回主頁與功能頁卡頓。

檢查：
- static/app.js 已通過 node --check。
- app.py / db.py 已通過 Python 語法編譯檢查。
```

---

### FIX114_README.txt

```text
FIX114：訂單/總單/客戶北中南拖拉 + 長按/右鍵/操作鍵封存刪除收斂版

修正內容：
1. 訂單 / 總單 / 出貨 / 客戶資料的北中南客戶列表改由 FIX114 單一母版渲染。
2. 客戶卡片可直接拖拉到北區 / 中區 / 南區。
3. 每張客戶卡片右側新增「操作」按鈕，避免手機長按或電腦右鍵被瀏覽器攔截時無法操作。
4. 長按、右鍵、操作按鈕都會打開同一個操作面板。
5. 操作面板提供：打開客戶商品、移到北/中/南、封存客戶、刪除客戶。
6. 封存客戶視窗保留還原，並新增刪除客戶按鈕。
7. 修正 FIX112/FIX113 之後仍可能被舊版延遲重繪覆蓋的問題。
```

---

### FIX115_README.txt

```text
FIX115：訂單 / 庫存 / 總單批量材質與批量刪除修正

1. 訂單、庫存、總單清單上方固定顯示材質下拉選單。
2. 批量加材質按鈕直接可見，不再被 FIX93 舊樣式隱藏。
3. 批量刪除按鈕直接可見，不再需要長按才能操作。
4. 保留舊要求：重新整理按鈕仍隱藏，避免多餘手動刷新與跳版。
5. 材質下拉選單包含 SPF/HF/DF/RDT/SPY/SP/RP/TD/MKJ/LVL/尤加利。
6. 後端批量材質允許 尤加利。
```

---

### FIX116_README.txt

```text
FIX116 新版覆蓋衝突修正版

已修正：
1. base.html / pwa.js / service-worker.js 的快取版本從 fix111 改成 fix116，避免手機或瀏覽器一直吃舊 app.js / style.css。
2. app.js 最後加入 FIX116 母版覆蓋層，會在舊函式跑完後重新套用最新版：
   - 訂單 / 總單 / 客戶資料的北中南客戶可拖拉移動區域。
   - 長按、右鍵、操作按鈕都能封存或刪除客戶。
   - 封存客戶視窗保留還原，並新增刪除客戶。
   - 庫存 / 訂單 / 總單固定顯示材質下拉、批量加材質、批量刪除。
3. style.css 最後加入 FIX116 強制顯示規則，覆蓋舊 FIX93 將批量工具隱藏的 display:none。
4. service worker 對 app.js / style.css 改成 network-first，防止舊快取擋住新功能。

覆蓋 GitHub 後 Render 重新部署即可。若手機仍看到舊畫面，關閉 App/PWA 再重開一次，或瀏覽器重新整理。
```

---

### FIX117_README.txt

```text
FIX117_清除重複工具列_拖拉不跳長按表

修正內容：
1. 刪除 FIX116 最後覆蓋工具列，避免訂單 / 庫存 / 總單出現兩排批量工具列。
2. 批量材質工具列只保留一套：全選目前清單、搜尋、材質下拉選單、批量加材質、批量刪除。
3. 移除工具列內的重新整理按鈕與舊版重複統整表。
4. 停用客戶卡片長按自動跳出「客戶操作」表，避免拖拉客戶跨北 / 中 / 南區時誤彈。
5. 保留「操作」按鈕與右鍵操作，可用來打開客戶商品、移動、封存、刪除。
6. 更新 base.html / pwa.js / service-worker.js 快取版本到 fix117-clean-single-toolbar-drag，避免手機或 PWA 吃舊檔。

覆蓋 GitHub 後請重新部署 Render；手機 PWA 若仍看到舊畫面，請關閉後重開一次。
```

---

### FIX118_README.txt

```text
FIX118 新版覆蓋舊版快取修正版

處理重點：
1. 強制更新 base.html / app.js / style.css / pwa.js / service-worker.js 版本為 fix118-hard-no-old-ui-cache-reset。
2. Service Worker 改成 network-only，安裝與啟用時清空舊快取，避免手機/PWA繼續吃 FIX112~FIX117 舊介面。
3. 後端 static 檔案暫時全部 no-store，避免 app.js / style.css 被瀏覽器快取擋住。
4. app.js 最後新增 FIX118 母版清理：
   - 訂單 / 庫存 / 總單只保留目前頁面需要的一套批量工具列。
   - 移除 yx116 等舊工具列與舊 summary。
   - 拖拉客戶時強制關閉舊長按操作表。
   - 舊 customer-action-sheet / yx112 / yx113 操作表不再顯示。
5. 保留：客戶拖拉移動區域、右鍵或操作按鈕封存/刪除、材質下拉批量加材質、批量刪除。

覆蓋 GitHub 後 Render 重新部署。
第一次開啟可能會自動刷新一次，這是清除舊 PWA 快取。
```

---

### FIX119_README.txt

```text
FIX119：訂單 / 總單北中南客戶新版母版

修正內容：
1. 訂單 / 總單點客戶後，下方商品清單改用 FIX119 新版 selectCustomerForModule 讀取。
2. /api/customer-items 後端改成 customer_uid OR customer_name 雙條件，避免 UID 舊資料不一致造成點開沒東西。
3. 北中南客戶列表改成 FIX119 單一母版渲染，移除 FIX112 / FIX113 / FIX114 / FIX117 / FIX118 舊版客戶渲染與右鍵/長按衝突。
4. 清掉舊 setTimeout / setInterval 的延遲重繪，避免打開北中南表時來回跳版。
5. 拖拉客戶時只做移動，不會跳出長按操作表；操作表只由「操作」按鈕或右鍵打開。
6. 保留封存客戶、刪除客戶、移到北/中/南區、打開客戶商品。
7. PWA / service worker 版本更新到 fix119，避免手機繼續吃舊檔。
```

---

### FIX120_README.txt

```text
FIX120 客戶點選商品清單接上修正版

修正重點：
1. 訂單 / 總單點選北中南客戶後，下方商品清單會用 customer_uid + customer_name 重新抓資料。
2. 修正舊版只用 customer_name 導致客戶有顯示、點開卻 0 件 / 0 筆的問題。
3. 點客戶後同步更新：
   - selected-customer-items 客戶商品表
   - 訂單清單 / 總單清單的新版統整表
   - 批量加材質 / 批量刪除仍可用
4. 舊版會把 selected-customer-items 隱藏的邏輯已用 FIX120 新版覆蓋。
5. app.js / pwa.js / service-worker.js / base.html 版本號已更新到 fix120-customer-click-items-connected，避免繼續吃舊版快取。

覆蓋方式：
直接把整包上傳 GitHub 覆蓋，Render 重新部署。
```

---

### FIX121_README.txt

```text
FIX121 訂單 / 總單點北中南客戶商品清單硬接修正版

修正內容：
1. /api/customer-items 改成 UID + 原客戶名 + 去 CNF/FOB/FOB代尾碼客戶名一起查詢。
2. 訂單 / 總單點北中南客戶後，直接覆蓋下方統整表與商品卡片，不再被舊版 0件/0筆函式蓋掉。
3. 加入前端防舊版回蓋保護：若舊函式又把畫面改成「目前沒有資料 / 0件0筆」，會自動恢復新版商品表。
4. 保留批量加材質、批量刪除、客戶拖拉、操作按鈕、封存/刪除客戶。
5. 快取版本更新到 fix121-order-master-customer-items-hard-connect。
```

---

### FIX122_README.txt

```text
FIX122：總單 / 訂單北中南客戶標籤長按編輯刪除與拖拉換區修正版

1. 重新以 FIX122 母版覆蓋客戶區渲染，避免舊版客戶卡片覆蓋拖拉與長按功能。
2. 訂單 / 總單 / 出貨 / 客戶資料的北中南客戶卡片支援指標拖拉換區。
3. 長按客戶卡片會開啟操作表，可打開商品、編輯客戶、移區、封存、刪除。
4. 拖拉移動時會取消長按計時，不會拖一拖跳出操作表。
5. 覆蓋 window.loadCustomerBlocks / renderCustomers / selectCustomerForModule / YX_MASTER，避免舊函式回蓋新版。
6. 更新 PWA / Service Worker / base.html 版本到 FIX122，避免吃舊版快取。
```

---

### FIX123_README.txt

```text
FIX123 客戶北中南安全母版修正版

修正重點：
1. 修復 Cannot assign to read only property 'loadCustomerBlocks' of object '#<Object>'。
   原因：舊版 YX_MASTER 被 Object.freeze() 凍結，FIX122 直接改子屬性導致整段新版客戶功能中斷。
   處理：改成 safeSetGlobal + 重新建立新的 YX_MASTER 物件覆蓋，不再直接寫入凍結物件屬性。

2. 訂單 / 總單北中南客戶標籤恢復新版功能：
   - 長按開啟操作表
   - 右鍵開啟操作表
   - 操作表包含：打開客戶商品、編輯客戶、移到北區、中區、南區、封存客戶、刪除客戶

3. 拖拉換區恢復：
   - 北區可拖到中區 / 南區
   - 中區可拖到北區 / 南區
   - 南區可拖到北區 / 中區
   - 拖拉時會取消長按計時，不會跳出操作表

4. 加強快取清除：
   - base.html / pwa.js / service-worker.js 版本升到 fix123-customer-region-safe-master
   - static no-store，避免繼續吃舊 app.js / style.css

檢查：
- static/app.js node 語法檢查通過
```

---

### FIX124_README.txt

```text
FIX124：客戶北中南舊事件攔截收斂版

本次檢查發現 FIX123 雖然覆蓋了 window.loadCustomerBlocks / selectCustomerForModule，
但 FIX120、FIX121、FIX71 之前註冊在 document 上的 click 事件仍然存在，
而且會抓 .customer-region-card，導致新版 yx122 客戶卡片點選後又被舊函式重跑，
出現舊表格覆蓋、0件/0筆回蓋、操作按鈕/長按/右鍵被擋住的問題。

修正：
1. FIX120 click handler 遇到 .yx122-customer-card 直接略過。
2. FIX121 click guard 遇到 .yx122-customer-card 直接略過。
3. 客戶資料頁舊 FIX71 click handler 遇到 .yx122-customer-card 直接略過，避免 stopImmediatePropagation 擋住新版操作。
4. base.html / pwa.js / service-worker.js 版本升到 fix124-customer-region-hard-converge，避免吃舊快取。

保留：
- FIX123 新版長按操作表
- 右鍵操作表
- 操作表：打開客戶商品 / 編輯客戶 / 移到北區中區南區 / 封存 / 刪除
- pointer 拖拉換區
- 未要求的其他功能不動。
```

---

### FIX125_README.txt

```text
FIX125 客戶事件母版收斂不刪功能版

本版目的：保留舊功能入口，但不讓舊事件 / 舊畫面邏輯再覆蓋新版客戶卡片，也降低返回主頁與切換功能頁卡頓。

已處理：
1. 建立 window.YX_CUSTOMER_CARD_CONTROLLER 作為唯一客戶卡片母版。
2. 點客戶、長按、右鍵、操作表、拖拉換北/中/南、編輯、封存、刪除，都走同一套母版。
3. 舊入口保留並轉接新版：loadCustomerBlocks、renderCustomers、selectCustomerForModule、yx119/yx120/yx121/yx122 相關入口。
4. 不物理刪除舊功能，避免舊功能消失；但舊事件不可再處理新版客戶卡片。
5. 以 window capture 事件優先攔截北/中/南客戶卡片，避免舊 document capture handler 先吃掉事件。
6. 加入客戶區 render gate：北/中/南客戶容器只接受 FIX125 母版渲染，舊 yx119/yx120/yx121/yx122 客戶畫面不再回蓋。
7. 對 /api/customers 與 /api/customer-items 做短暫去重快取，降低舊 FIX 重複 GET 造成的速度問題。
8. 更新 build version 與 service worker 版本，避免吃舊快取。

保留功能：
- 打開客戶商品
- 長按開操作表
- 右鍵開操作表
- 編輯客戶
- 移到北區 / 中區 / 南區
- 封存客戶
- 刪除客戶
- pointer 拖拉換區
- 拖拉時不跳長按表
- 客戶商品列表 / 統整表 / 批量勾選資料結構
- 今日異動、倉庫、庫存、訂單、總單其他功能未主動改動
```

---

### FIX126_README.txt

```text
FIX126_快取清除_PWA版本同步_舊事件速度再收斂版

本版只修 FIX125 後續穩定性與速度問題，不刪功能：
1. 客戶編輯 / 改名 / 移區 / 封存 / 刪除後，立即清除 /api/customers 與 /api/customer-items 短暫快取，避免剛改完又顯示舊資料。
2. force 重新載入時加入 yx_force=1，直接跳過客戶快取。
3. PWA 版本統一為 fix126-cache-clear-pwa-version-sync-speed：base.html、manifest、pwa.js、service-worker.js 同步。
4. pwa.js 改為只有版本變更時才清 cache，不再每次開頁都清，降低返回主頁與開功能頁延遲。
5. MutationObserver 改為選擇性封鎖舊版 observer，不再整個全域打成永久空函式，降低未來新版功能被擋掉的風險。
6. smoke_test.py 更新為 FIX126 標準。

保留 FIX125：點客戶、長按、右鍵、編輯、移北中南、封存、刪除、pointer 拖拉、拖拉時不跳長按表。
```

---

### FIX127_README.txt

```text
FIX128_目前問題處理版

本版在 FIX126 基礎上處理目前仍會影響速度與穩定的問題：

1. 修正靜態檔每次開頁都 no-store 的問題。
   - app.js / style.css / pwa.js 已使用版本號 ?v=fix128。
   - 有版本號的 static 檔改為長快取，減少返回主頁與開功能頁重新下載造成的慢。

2. Service Worker 改成版本化靜態檔 cache-first。
   - API / HTML 仍永遠走網路，不會吃舊資料。
   - static/app.js、style.css 帶版本號後會快取，版本變更才換新。

3. 外層 API 短快取不再快取 /api/customers、/api/customer-items。
   - 避免客戶移區、編輯、刪除後又短暫顯示舊資料。
   - 所有 POST/PUT/DELETE 後會清除短 API 快取。

4. 客戶商品點擊加上請求序號防止 race condition。
   - 快速點多個客戶時，較慢回來的舊回應不會覆蓋目前畫面。

5. 客戶區載入時取消 3 次重複延後重畫，只保留 1 次校正。
   - 減少切頁、返回主頁、開客戶區的卡頓。

保留 FIX126 功能：長按操作、右鍵操作、拖拉換北/中/南、編輯、封存、刪除、PWA 版本同步。
```

---

### FIX128_README.txt

```text
FIX128_目前問題再收斂穩定版

本版基於 FIX127，只處理目前殘留的穩定度與速度問題，不刪除既有功能。

修正內容：
1. 版本統一升級為 fix128-current-issues-final-stability。
   - base.html
   - pwa.js
   - service-worker.js
   - manifest.webmanifest
   - smoke_test.py

2. 加入 FIX128 客戶母版鎖定層。
   - loadCustomerBlocks
   - renderCustomers
   - selectCustomerForModule
   - YX_MASTER
   舊 FIX 若在延遲任務中再次覆蓋這些入口，會被攔下或自動轉回新版母版。

3. 加強資料修改後的即時清快取。
   只要修改以下資料，就會清除短 API 快取與客戶快取：
   - 客戶
   - 客戶商品
   - 庫存
   - 訂單
   - 總單
   - 出貨
   - 倉庫

4. 新增舊客戶卡 DOM 校正。
   如果舊版非 yx125 客戶卡又被非同步插回北 / 中 / 南區，會自動要求新版 controller 重刷一次。

5. 保留既有功能：
   - 點客戶打開商品
   - 長按操作表
   - 右鍵操作表
   - 編輯客戶
   - 移到北 / 中 / 南區
   - 封存客戶
   - 刪除客戶
   - pointer 拖拉換區
   - 拖拉時不跳長按表
   - 靜態檔版本化快取

檢查結果：
- static/app.js Node 語法檢查通過
- static/pwa.js Node 語法檢查通過
- static/service-worker.js Node 語法檢查通過
- Python 檔案 py_compile 通過
- tools/smoke_test.py 通過
```

---

### FIX129_README.txt

```text
FIX129_目前問題事件收斂與首頁速度版

處理重點：
1. 在 app.js 最前面加入 FIX129 early old-event gate：舊 FIX119～FIX124 的客戶事件、舊今日異動自動刷新、舊倉庫渲染事件不再重複註冊。
2. 保留 FIX128 客戶母版，不刪功能；點客戶、長按、右鍵、拖拉換區、編輯、封存、刪除仍走新版 controller。
3. 新增 /api/today-changes?summary_only=1 輕量模式：首頁只抓未讀數，不再順便重算未入倉，降低返回主頁卡頓。
4. 首頁今日異動按鈕新增輕量紅色未讀徽章，不載入整包 app.js，避免首頁變慢。
5. PWA / Service Worker / manifest / base.html / smoke test 版本統一升級為 fix130-current-problems-final-converge-keep-features。

檢查結果：
- static/app.js 語法檢查通過
- static/pwa.js 語法檢查通過
- static/service-worker.js 語法檢查通過
- Python 檔案編譯通過
- FIX129 smoke test 通過

注意：
- 這版不是直接刪舊功能，而是阻止舊事件重複註冊與舊畫面重繪，功能入口仍保留並轉接新版。
```

---

### FIX130_README.txt

```text
FIX130_目前問題總收斂保留功能版

處理項目：
1. 首頁補回「登出」，設定 / 今日異動 / 登出保持同一列，首頁仍不載入大型 app.js。
2. 舊事件收斂改成更精準：不再用 FIX 編號整段攔截，避免倉庫、格位、批量、表格功能被誤擋。
3. MutationObserver 不再整個擋全頁 observer，只擋已判定的舊版亂重畫 observer。
4. 今日異動最後鎖定一套直列卡片與手動刷新，刪除舊版橫排 / 舊刷新按鈕回蓋。
5. 客戶長按、右鍵、拖拉換區、編輯、封存、刪除維持走新版母版 controller；舊入口只轉接，不刪功能。
6. PWA / Service Worker / manifest / base.html / smoke test 版本同步 FIX130。
```

---

### FIX131_README.txt

```text
FIX131_目前問題_今日異動舊版計時器與首頁列修正版

本版只針對 FIX130 殘留問題收斂，不刪除其他功能：

1. 今日異動固定新版直列卡片
- 阻擋舊 FIX99 的延後 setTimeout 再次執行 clearTodayTop99。
- 避免新版今日異動先顯示，之後又被舊版隱藏 summary / filter / refresh。
- 保留新版一套直列卡片、手動刷新、刪除異動、未讀清除。

2. 今日異動篩選與刷新穩定
- 全部 / 進貨 / 出貨 / 新增訂單 / 未錄入篩選不再被舊版隱藏。
- 刷新按鈕統一成 FIX131 版本。
- 舊版 yx99 今日異動列會被新版列覆寫，不再殘留混排。

3. 首頁列修正
- 首頁改回：設定 / 今日異動 / 登出 在同一列。
- 使用者名稱獨立顯示在下方置中，不再混在功能按鈕列裡。
- 首頁仍不載入大型 app.js，保持返回首頁速度。

4. 版本同步
- base.html / app.js / pwa.js / service-worker.js / manifest / smoke_test 全部升到 FIX131。
- PWA 版本升級，避免手機或已安裝 App 吃到 FIX130 舊快取。

檢查結果：
- static/app.js 語法檢查通過
- static/pwa.js 語法檢查通過
- static/service-worker.js 語法檢查通過
- Python 檔案編譯通過
- FIX131 smoke test 通過
- ZIP 完整性通過
```

---

### FIX132_README.txt

```text
FIX132_目前問題今日異動未讀穩定版

本版處理 FIX131 後仍可能出現的目前問題，重點是不刪功能，只補齊會壞或會卡的部分：

1. 今日異動「只看未讀」按鈕修正
   - 改成真正依照讀取時間判斷未讀。
   - 未讀項目會標記「新」。
   - 切換「只看未讀 / 顯示全部」不會重打 API，不會造成卡頓。

2. 今日異動「清除已讀」文案修正
   - 改為「清除未讀數」。
   - 按下後只清徽章/未讀數，不重畫成舊版畫面。

3. 今日異動重複載入收斂
   - 舊版與新版若同時呼叫 /api/today-changes，會合併同一個請求，避免開頁時重複抓資料。
   - 保留手動刷新按鈕，需要重新算未錄入倉庫圖時才刷新。

4. 今日異動畫面鎖定新版直列卡片
   - 保留分類篩選、刪除異動、清除未讀數、未錄入倉庫圖列表。
   - 舊版 yx130 / yx131 畫面殘留會被新版 yx132 卡片覆蓋掉。

5. PWA / Service Worker / manifest / base.html / smoke test 版本升到 FIX132
   - 避免手機或已安裝 App 繼續吃 FIX131 快取。

檢查項目：
- static/app.js 語法檢查
- static/pwa.js 語法檢查
- static/service-worker.js 語法檢查
- app.py / db.py / backup.py / ocr.py Python 編譯
- FIX132 smoke test
- ZIP 完整性
```

---

### FIX133_README.txt

```text
FIX133_目前問題未讀清除滑動刪除穩定版

本版針對 FIX132 後仍可能遇到的殘留問題做小範圍收斂：

1. 今日異動「清除未讀數」現在會同步清掉畫面上的新標記，不會只清徽章數字。
2. 「只看未讀」會同步隱藏已讀項目，並在沒有未讀時顯示空狀態。
3. 只看未讀時，未錄入倉庫圖區塊不會混進未讀異動列表。
4. 今日異動卡片支援左滑刪除，保留原本刪除按鈕。
5. 加強今日異動舊版 DOM 清理，避免舊版橫排 / 舊刷新列延後插回來。
6. 修正舊客戶選取函式在 API 失敗時可能因 requestSeq 未定義造成 ReferenceError。
7. PWA / Service Worker / manifest / base.html / smoke test 版本統一升到 FIX133，避免手機吃舊快取。

不刪除既有功能，只針對目前會亂跳、未讀清除不同步、手機滑動刪除與舊事件殘留做補強。
```

---

### FIX134_README.txt

```text
FIX134_商品顯示精準列穩定版

修正重點：
1. 客戶商品改用 raw/exact 原始列資料，不再用合併後第一筆 id 代表多筆商品。
2. 批量加材質、批量刪除、單筆編輯/刪除使用正確原始 id，避免畫面看起來多件但實際只改到第一筆。
3. 清理商品卡片顯示：product_code 如果其實是尺寸/商品文字，不再誤顯示成材質。
4. 商品卡片固定為：左上材質、右上件數、下方純商品尺寸與支數，不再把「未填材質」或商品文字混進材質欄。
5. 點北中南客戶後固定走 FIX134 商品母版，避免舊版聚合商品畫面回蓋。
6. PWA / Service Worker / manifest / base.html / smoke test 全部升到 FIX134。

不刪除既有功能：長按、右鍵、拖拉換區、編輯客戶、封存、刪除、批量加材質、批量刪除都保留。
```

---

### FIX135_README.txt

```text
FIX135_商品操作來源同步穩定版

本版針對目前「商品怪怪的 / 點商品後操作不穩」再收斂：

1. 客戶商品點開後，編輯 / 直接出貨 / 刪除會優先使用目前顯示的原始商品列，不再回頭抓舊的全頁列表造成空白或錯列。
2. 新版商品母版同步寫回 YX_CUSTOMER_CARD_CONTROLLER.selectCustomerForModule / openProducts，避免舊 controller 又把商品畫面蓋回舊版。
3. 客戶商品修改、批量材質、批量刪除後，會延遲重抓目前選取客戶，避免操作後跳回全列表或舊資料。
4. PWA / Service Worker / manifest / base.html / smoke test 版本全部升到 FIX135。
5. 不刪除原本功能，只把商品操作來源與新版客戶商品母版統一。
```

---

### FIX136_README.txt

```text
FIX136_商品操作舊事件攔截修正版

修正內容：
1. 修正舊版 window capture 商品操作事件會先吃掉新版 yx134 商品卡。
2. 新版客戶商品卡的 編輯 / 直接出貨 / 刪除 會重新交回原始商品列母版處理，不再抓錯舊全列表資料。
3. 保留舊商品卡操作；只讓舊 handler 略過 yx134 新版商品卡，不刪功能。
4. 版本同步到 fix136-product-action-capture-fix，避免 PWA / Service Worker 吃舊快取。
```

---

### FIX137_README.txt

```text
FIX137_商品操作最後同步穩定版

本版處理目前商品操作/顯示仍可能怪怪的問題：

1. 新增 FIX137 商品操作最上層 window capture，會在所有舊 document 商品事件前先處理新版 yx134 商品卡。
2. 編輯 / 直接出貨 / 刪除一律使用目前客戶的 raw 原始商品列，不再回抓舊全列表或聚合後 id。
3. yx134 商品列/card 補上 product_text、qty、material、size、support dataset，避免找不到 active rows 時抓錯資料。
4. 商品操作後清短快取並重載目前選取客戶，避免畫面跳回舊資料。
5. 一般商品卡移除「未填材質」文字，空材質不再顯示干擾字。
6. PWA / Service Worker / manifest / base.html / smoke test 全部升到 FIX137。

保留：客戶長按、右鍵、拖拉換區、批量加材質、批量刪除、直接出貨、今日異動、倉庫功能。
```

---

### FIX138_README.txt

```text
FIX138_商品表格唯一母版操作穩定版

本版處理目前商品區殘留問題：

1. 點北/中/南客戶後，商品區收斂成 selected-customer-items 這一套母版，不再同時露出下方舊訂單/總單清單造成畫面像有多張商品表。
2. 商品母版表格補上「編輯 / 直接出貨 / 刪除」操作欄，仍使用 FIX137 的 raw 原始商品列 id，不會抓到舊聚合 id。
3. 商品母版表格補上勾選與批量操作：全選目前清單、批量加材質、批量刪除。
4. 批量操作會使用目前客戶畫面上的原始 source/id，修改後清快取並重新載入目前客戶商品。
5. 保留 FIX137 直接出貨草稿、編輯、刪除、防舊事件搶操作邏輯。
6. PWA / Service Worker / manifest / base.html / smoke test 版本同步升到 FIX138，避免手機吃舊快取。

沒有刪除原本功能；只是把商品顯示與操作收斂到最新母版，舊版下方重複清單在選取客戶時隱藏，避免畫面和事件互相干擾。
```

---

### FIX139_README.txt

```text
FIX139_模組化事件隔離防舊版覆蓋版

本版把主要畫面區塊加上 data-yx-module / data-yx-container，並建立 window.YX 母版：

- 客戶卡片模組 customerCards
- 商品表格模組 productTable
- 商品小卡模組 productCards
- 今日異動模組 todayChanges
- 倉庫格子模組 warehouseGrid
- 長按操作表模組 actionSheet
- 拖拉換區模組 dragRegion
- 批量操作模組 batchOps
- 搜尋篩選模組 searchFilter
- 首頁徽章模組 homeBadge

處理重點：
1. 畫面分開：每個模組只標記、整理自己的容器。
2. 事件分開：新版客戶卡點擊 / 右鍵會在模組層先處理，不讓舊事件搶走。
3. 容器分開：動態產生的商品列、商品卡、倉庫格子、今日異動卡都會被歸屬到自己的 data-yx-module。
4. 資料來源統一：window.YX.store / window.YX.api 統一管理快取清除與 API 入口。
5. API 操作統一：window.YX.actions 提供客戶、商品、今日異動、倉庫等刷新入口。
6. 快取清除統一：新增 / 編輯 / 刪除 / 出貨 / 移區後會透過 YX.store.clear 觸發收斂。
7. 保留 FIX138 商品唯一母版，不刪功能。
8. PWA / Service Worker / manifest / base.html / smoke test 版本統一為 FIX139。
```

---

### FIX140_README.txt

```text
FIX140_舊函式封存DOM寫入鎖RenderToken防覆蓋版

處理內容：
1. 新增早期舊事件閘門，舊 document/window 全域事件遇到新版 data-yx-module 會略過。
2. 舊函式名稱保留，但封存到 YX.legacy，公開入口轉接新版 YX.actions / YX.guard。
3. 新版容器加 DOM 寫入權限鎖，防止舊 innerHTML / appendChild / replaceChildren 覆蓋新版容器。
4. 每個模組加 Render Token，刷新只允許目前最新模組任務寫入。
5. 舊 setTimeout / setInterval / 舊 observer 類延遲重畫集中管理，提供 YX.guard.cancelLegacyTimers()。
6. 新增覆蓋偵測器，若舊 DOM 類名被插回新版容器，會記錄並排程刷新該模組。
7. 統一快取清除：POST / PUT / DELETE 後會清除短快取與客戶快取。
8. PWA / Service Worker / manifest / base.html / smoke test 版本同步 FIX140。

保留功能：
- 客戶卡片、商品表格、商品小卡、今日異動、倉庫格子、長按操作表、拖拉換區、批量操作、搜尋篩選、首頁徽章。
- 舊入口不刪除，只轉接新版母版，避免功能消失。
```

---

## FIX144_出貨穩定與倉庫簡潔格位顯示版

本版只覆蓋本次指定的函式區塊，其餘功能保留：

- 出貨流程改成單一穩定母版：確認送出只產生一次出貨預覽，確認扣除只送一次 `/api/ship`，並在完成後刷新客戶、訂單、總單與倉庫資料。
- 出貨預覽保留 README 原要求：扣除來源、總單 / 訂單 / 庫存前後數量、倉庫位置、材積算式、重量輸入與總重計算。
- 商品卡的「直接出貨」改走同一個出貨預覽母版，避免舊事件搶走導致沒有反應或卡住。
- 倉庫格位顯示改成簡潔格式：只顯示格號、客戶名稱、各客戶件數加總與總件數。
- 倉庫格位不再顯示 FOB / CNF / FOB代、商品尺寸、材質與「第 X 格」字樣。
- 未指定客戶在倉庫格位中統一顯示為「庫存」。
- 出貨頁客戶商品下拉選單、倉庫格位批量加入下拉選單改成穩定渲染，避免載入時先跳舊選單再跳新版。
- 倉庫長按格子操作表仍保留返回未入倉、插入格子、刪除格子，並改用 FIX144 倉庫渲染刷新。
- PWA / Service Worker / manifest / base.html / smoke test 版本同步升到 FIX144。

---

## FIX145_硬鎖出貨與倉庫格位防舊版覆蓋

本版針對 FIX144 被舊版覆蓋的情況補強：

- 將出貨確認、出貨預覽、客戶商品下拉選單鎖到 FIX145 母版，舊函式不能再覆蓋。
- 將倉庫圖 `renderWarehouse / renderWarehouseZones / openWarehouseModal / saveWarehouseCell` 鎖到 FIX145 母版。
- 新增 DOM 寫入鎖：舊函式嘗試把 `zone-A-grid / zone-B-grid` 寫回舊格式時會被擋下並自動重畫新版。
- 新增覆蓋偵測器：如果舊版把「第 01 格」、FOB/CNF、尺寸文字插回倉庫格子，會自動修回新版簡潔格式。
- 倉庫格子固定顯示：格號單數字、客戶名紅字、件數加總藍字；未指定客戶統一顯示「庫存」。
- 出貨頁與倉庫格位商品下拉選單加上 FIX145 選項標記，避免舊版下拉選單先跳一下再被新版覆蓋。
- 商品卡「直接出貨」按鈕由最前層事件接管，避免舊商品卡事件吃掉。
- PWA / Service Worker / manifest / base.html / smoke test 同步升到 FIX145。



## FIX146_硬鎖FIX143與FIX144防覆蓋

- 將 FIX143 的首頁、今日異動、設定頁、客戶卡、商品表格、商品小卡、商品操作按鈕重新硬鎖，避免舊版 DOM / timer / observer 延遲回蓋。
- 修正 FIX143 標記與 CSS 對不上問題：`data-yx-fix143` 固定為 `FIX143_CURRENT_UI_PRODUCT_CUSTOMER_STABLE`，讓蘋果質感客戶卡、首頁姓名位置、今日異動篩選列、小卡樣式確實套用。
- 將 FIX144 出貨穩定母版與倉庫簡潔格位顯示一起硬鎖，並保留 FIX145 的出貨與倉庫防覆蓋邏輯。
- 新增 FIX146 修復層：偵測舊版寫回今日異動篩選列、首頁登出、OCR 模式卡、商品小卡、客戶紅框、倉庫舊格位內容時，自動修正回新版。
- 商品「編輯 / 直接出貨 / 刪除」按鈕由 FIX146 最前層事件接手，操作後清快取並重載目前客戶商品。
- PWA / Service Worker / manifest / base.html / smoke test 版本同步升到 FIX146。
