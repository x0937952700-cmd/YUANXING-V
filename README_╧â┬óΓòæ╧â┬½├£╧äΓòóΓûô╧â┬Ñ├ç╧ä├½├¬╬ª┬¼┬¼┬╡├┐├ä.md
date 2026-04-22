這版已改成固定 Render 網址原生 App。

內建網址：`https://yuanxing-v.onrender.com`

注意：這個網址是依 `render.yaml` 的 service name 推定，不是我直接驗證過的實際連線網址。
如果你的 Render 實際網址不同，請修改：

- `native_app/src/main.ts` 中的 `FIXED_BACKEND_URL`
- `native_app/capacitor.config.ts` 中的 `allowNavigation`

原有網頁系統功能未變，原生層只負責：
- 固定網址載入
- 原生相機 / 相簿
- 原生 OCR
