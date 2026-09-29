# 我的新北市 APP 雙平台評分自動追蹤

每天自動擷取：
- iOS App Store：平均評分、評分數
- Google Play：平均評分、評分數（另保留 writtenReviews）

資料每天寫入 `data/history.json`，網站由 `index.html` 直接讀取。

## 部署（GitHub Pages）
1. 建立一個新的 GitHub repository。
2. 將此資料夾內所有檔案上傳到 repository 根目錄。
3. 到 **Settings → Actions → General → Workflow permissions**，選擇 **Read and write permissions**。
4. 到 **Actions → Daily App Rating Fetch → Run workflow**，先手動執行一次。
5. 到 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main` / `(root)`。
6. 之後每天台灣時間約 08:10 自動抓取一次。

## App 資訊
- iOS App ID：1144883205
- Android package：tw.gov.newTaipeiApp.android

## 注意
Apple 使用公開 iTunes Lookup API。Google Play 沒有提供同等的公開評分 API，因此本專案使用 `google-play-scraper` 讀取公開商店資料；若 Google 未來改版，可能需要更新套件版本。
