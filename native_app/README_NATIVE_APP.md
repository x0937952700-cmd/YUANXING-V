# 沅興木業 原生 App（固定網址版）

這版已改成固定後端網址，不用每次輸入。

## 固定網址

目前原生殼層內建的是：

`https://yuanxing-v.onrender.com`

這個網址是依照專案內 `render.yaml` 的 service name=`yuanxing` 推定的預設 Render 網址。
如果你的實際 Render 網址不是這個，只要改 `src/main.ts` 內的 `FIXED_BACKEND_URL`，再重新 build 即可。

## 這版內容

1. 保留你原本 Flask / Render 系統功能不動。
2. 今日異動刪除後，前端立即重繪。
3. 移除原生 App 裡手動輸入網址流程，開啟 App 直接進系統。
4. 手機 OCR 改成原生端辨識。
5. Android OCR 插件改用 `@jcesarmobile/capacitor-ocr`，README 內容沒有要求 `google-services.json`。

## 建置步驟

```bash
cd native_app
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

如果你要出 APK：

```bash
cd native_app
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

完成後 APK 會在：

`android/app/build/outputs/apk/debug/app-debug.apk`
