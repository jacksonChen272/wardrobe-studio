# 重構與驗收 — 2026-09-11

## 1. 原版主要問題

React 19 / Vinext / Vite / Three.js / Tailwind 可以保留。原頁面混合2D及3D座標狀態，每次換衣重建場景；原模型已穿好衣服，重塗白色不能變成乾淨人台。服裝幾何與人體不共用座標；完整商品照片帶透明輪廓映射，造成紙片、穿模和側面錯誤。匯出仍使用舊2D合成，與WebGL不一致。

## 2. 新架構

保留stack及Pages。React管理mode/outfit IDs/import；wardrobe管理資料；import-pipeline管理分離和外觀；garment-geometry管理共用人體座標表面；avatar-3d管理長存活場景。沒有後端或付費AI。

## 3. 修改檔案

app/page.tsx、app/globals.css、app/layout.tsx、components/avatar-3d.tsx、lib/wardrobe.ts、lib/import-pipeline.ts、lib/garment-geometry.ts、public/models/mannequin.json、scripts/prepare-avatar.mjs、scripts/test.mjs、package.json/lock、.gitignore、GitHub workflow、README和授權/本報告。保留既有UI primitives與不相關資料。

## 4. 3D Avatar

MakeHuman CC0基礎人體，26,756 triangles，固定自然體型；有五官、手掌、手指及足部。不是PNG、幾何球體人偶或CSS旋轉。依最新規格僅提供一個固定人體。

## 5. Garment Mesh

共用人體座標的tights/skirt helper mesh，依類別裁出上衣、褲、裙、鞋表面。交界三角形精確裁切，邊界加薄壁；BODY < BOTTOM < TOP法線偏移，遮蔽被衣服覆蓋的皮膚，depth test/write。不是Plane、Sprite或Billboard。長袖各細分類目前仍共用基本殼，並非十二套精修商品模型。

## 6. 圖片如何成為外觀

驗證JPG/PNG/WEBP及15MB上限 → 最長邊1024 → alpha或邊緣連通背景分離 → mask/processed image → 手動類別確認 → 主色或手動布料取樣 → 128²重複紋理 → 3D表面。GarmentSegmenter可替換；複雜背景明確降級手動。沒有自動語意識衣、真人分離或Logo還原。

## 7. Swipe Zone

正交相機投影頭下、腰、踝、足底高度為normalized Y。PointerDown鎖定category；水平距離>=max(28px,canvasWidth×6.5%)且大於垂直1.3倍才切一件。同一Pointer Events處理滑鼠/觸控；cancel/lostcapture清理手勢。

## 8. Mode切換

Builder強制正面，只換衣。查看穿搭保留三個IDs，清除手勢並進Inspect，只更新水平角度，使用damping；換衣入口停用。回Builder保留衣物並回正面。Inspect有五角度、縮放、同一WebGL畫面PNG匯出。

## 9. Performance

Renderer僅初始化一次；只重建變動類別，另更新皮膚遮蔽。釋放舊geometry/material/texture。DPR<=1.5，持续慢幀降至1，高DPI關閉MSAA，無shadow maps，背景頁不render。主要場景5個mesh/約5 draw calls；每個衣物模板<15k triangles。3D延遲載入，圖片<=1024px、布料128px；換裝180ms，尊重reduced-motion。未宣稱實體手機60fps。

## 10. Build/Test結果

- npm test：24 checks PASS（類別隔離/循環/反向、門檻、投影邊界、十二模板有限座標/深度/面數、皮膚遮蔽、透明/白底/複雜背景fallback、v1遷移、保存重讀、不重複遷移、舊配飾保留）。
- tsc --noEmit：PASS。
- Windows build：五個編譯階段與static prerender完成，但最後libuv shutdown assertion導致exit 1，不能稱乾淨成功。Linux GitHub CI包含tests/tsc/build，是發布閘門。
- Chrome桌面和390×844 viewport實際拖曳三個分區，各只切指定類別；Builder不旋轉；Inspect旋轉且衣物保留。
- 範例藍外套已由同一importFile(File)流程解碼、辨識透明背景、選外套、手動布料取樣、IndexedDB保存並自動換上。實際查看90°側面，有軀幹與袖子深度，不是紙片。
- 實際重新整理後衣櫥仍有範例藍外套；Inspect放大按鈕由100%變115%，縮放不改變衣物選擇。
- OS檔案選擇器自動上傳被工具拒絕Not allowed，未標為PASS；範例流程不冒充本機file-picker驗收。
- 手機viewport不等同實體手機；雙指觸控、真機FPS尚未驗證。
- 開發頁有Grammarly注入body屬性的hydration warning及擴充套件警告，未用suppressHydrationWarning隱藏。
- npm安裝檢查顯示依賴11項漏洞（含8 high）；未用破壞性的force upgrade擴大修改，需要獨立安全升級。

## 11. 仍屬近似/Prototype

色彩/材質穿搭示意，不是尺寸、服裝裁片或物理模擬；襯衫/外套/帽T共用長袖殼，帽子、口袋、拉鍊、鞋底還未精修，鞋較像貼腳套。側背面為色彩延續；布料取樣會重複，需避開Logo、接縫與皮膚。不能稱為商品級真實試穿。

## 12. 下一版三件事

1. 服裝美術精修同人台的獨立領口、帽子、裙褶及鞋底模板。
2. 本機語意分割、可修正mask與前片UV/Logo定位。
3. 真機觸控/性能回歸、衣櫥備份還原及依賴安全升級。
