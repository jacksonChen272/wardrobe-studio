# 衣櫥實驗室

真正人體網格與包覆式服裝表面的 3D 穿搭工具。快速穿搭模式分區滑動換上衣、下身、鞋子；查看穿搭後才旋轉、縮放，或匯出同一畫面的 PNG。

衣物照片透過 IndexedDB 保存在使用者自己的瀏覽器，不會傳送到外部伺服器。

新人體使用 MakeHuman CC0 基礎網格。舊 GLB 不再載入；原先把所有示例模型一概稱為 MIT 授權的說法已移除。來源見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

「加入衣櫥」支援檔案上傳、拖入圖片及圖片 URL。確認頁包含原圖、去背結果、可修正輪廓、分類、名稱與即時 3D 試穿；確認後才儲存。

新匯入衣物保留原圖正面印花、Logo、文字及明暗，以一次性正面投影貼合服裝表面，不再只取平均色或重複一小塊布料。T-shirt、襯衫及 Hoodie 使用不同袖長、衣長、鬆量與立體細節，並可手動調整。既有衣物資料相容保留；舊版匯入的衣物需重新匯入原圖，才會取得新外觀資料。

這仍是近似試穿，不是單張圖片完整 3D 重建或布料物理模擬。白底／透明底做啟發式分離；人物、衣架、雜亂背景可能需要手動圈選衣物，分類也需確認。側背面與部分袖子使用推算布料，不承諾還原看不見的商品細節。不使用付費 AI API。衣櫥限目前瀏覽器；清除網站資料會移除它，沒有跨裝置同步。

本次外觀架構、匯入流程與驗收見 [APPEARANCE_REPORT.md](APPEARANCE_REPORT.md)。

完整重構、驗收與尚未完成的部分見 [REBUILD_REPORT.md](REBUILD_REPORT.md)。

## 本機開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

`npm test` 執行資料/網格/圖片分離測試；`npx tsc --noEmit` 檢查型別。Node 22+。
`node scripts/prepare-avatar.mjs` 依 SHA-256 鎖定來源重建人體資產。
Windows Vinext 在 prerender 後可能遇到 libuv shutdown assertion；部署採 Linux GitHub Actions。
