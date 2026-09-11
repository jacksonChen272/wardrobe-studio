# 衣櫥實驗室

真正人體網格與包覆式服裝表面的 3D 穿搭工具。快速穿搭模式分區滑動換上衣、下身、鞋子；查看穿搭後才旋轉、縮放，或匯出同一畫面的 PNG。

衣物照片透過 IndexedDB 保存在使用者自己的瀏覽器，不會傳送到外部伺服器。

新人體使用 MakeHuman CC0 基礎網格。舊 GLB 不再載入；原先把所有示例模型一概稱為 MIT 授權的說法已移除。來源見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

圖片提供布料主色和手動取樣紋理，並非商品結構完整重建。複雜照片需手動選擇版型及布料，不使用付費 AI API。衣櫥限目前瀏覽器；清除網站資料會移除它，沒有跨裝置同步。

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
