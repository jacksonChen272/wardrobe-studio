# 商品外觀與加入衣櫥改善

## 原因分析

舊流程把圖片轉成主色或一小塊重複布料紋理，沒有保留 Logo、文字、印花在原圖的位置。服装套用共用表面時，袖長、衣長和領口也缺少足夠區別。增加 CSS 不會解決這兩個問題。

## 本次修改

- `GarmentAppearance` 保存去背後完整來源像素、正面取樣區域、處理方式及估計信心；`GarmentShape` 保存袖長、衣長、鬆量、領型、褲管寬與裙擺參數。原 IndexedDB 記錄仍可讀取。
- 正面投影使用獨立 UV 與朝向權重，圖案只映射一次，不在背面重複。主要前胸圖案、文字與原照明暗保留；側面逐漸過渡至主色布料。
- 服裝表面依參數裁切與變形；短袖 T、長袖襯衫、Hoodie 有不同輪廓。新增領口滾邊、肩線、翻領、門襟、鈕扣、帽兜、抽繩、袋口線、下擺線、鞋底與鞋帶幾何，以及細微布料凹凸。
- 頂部與衣櫥內有明顯「加入衣櫥」入口。檔案上傳、檔案拖曳、拖入图片 URL、貼上 URL 進入同一處理流程。
- 圖片解碼（最長邊 1024）→ 透明度／邊緣背景分離 → Mask → 輪廓與主要色彩 → 分類、版型估計 → 完整正面像素 → 模板與即時試穿 → 人工確認 → IndexedDB 保存。
- 確認頁顯示原圖、去背圖、分類、名稱及同一渲染器的 3D 預覽。可修改分類／版型／名稱，調整形狀，以多邊形修正分離結果。沒有確認，不儲存、不變更主畫面穿搭。
- 圖片 URL 限 HTTP(S)、無登入資訊、JPG/PNG/WEBP、15MB、15 秒逾時。請求不帶登入憑證或 referrer；CORS／失效／商品 HTML 頁顯示下載再上傳的替代路徑，保留原網址與操作入口，不使用不明代理服務。
- 原 `down / move / up / change / switchMode / resetGesture` 六個手勢函數 AST 指紋完全相同。沒有重做分區 swipe。

## 已執行驗收

- 自動測試 34 項通過：包含原有 24 項、手勢函數回歸指紋、T-shirt 分類誤判修正、三種上衣幾何差異、翻領／帽兜／雙鞋底、有限正面 UV 與背面零權重、URL 成功與 CORS／HTML／不安全網址失敗，以及 v2 外觀資料保存／重讀。
- TypeScript 無錯誤。
- 真實瀏覽器檔案選擇器上傳白色紅圖 T，原圖、去背及 3D 正面都保留大型太陽與 `STUDIO` 字樣；背面沒有複製胸前圖案。
- 使用本機圖片 URL 匯入黑色素 T，兩件衣服各自命名並保存；重新載入後仍在衣櫥。僅目前搭配會依原行為重設。
- 滑動上衣區，黑 T 切換為紅圖白 T，褲子與鞋子不變。六個核心手勢函數另有自動回歸保護。
- 預覽切換短袖、襯衫與 Hoodie，檢查長短袖、翻領與帽兜差異，轉到側背面檢查投影。
- 390 × 844 瀏覽器窄螢幕檢查：明顯上傳入口、確認頁可捲動，DOM 寬度與 scrollWidth 均為 390，沒有橫向溢出。
- 輸入非圖片商品頁會顯示替代方案，網址保留，之後仍可用範例／上傳進入確認頁。CORS 錯誤分支另以模擬請求自動測試。
- 此輪真實瀏覽器沒有記錄到渲染錯誤。尚未在實體手機相簿／系統檔案拖曳做端到端測試；桌面檔案選擇器與手機尺寸瀏覽器已驗證，不能等同實體手機全機型保證。

## 真實限制

沒有加入語意分割 AI、人體解析模型、OCR 或商品 3D 重建服務。Logo／印花的保留來自原始像素，不是辨識後重新繪製。分類主要依檔名與輪廓啟發式估計，信心數字不是經過資料集校準的機率。真人照片可能保留人物／背景，必須檢查並手動圈選；也不能從正面照片可靠推知背後圖案、布料厚度、精確尺寸或實際垂墜。現有射影最適合正面上衣胸腹圖案，袖子及褲鞋的細節映射仍是近似。不是商品完全等比例的數位孿生。

舊資料不被自動覆寫或重新去背；舊衣物想使用這套外觀表示，請重新匯入原圖。

## 測試圖片來源

以下是本次透過內建 ImageGen 產生的合成驗收圖片，不是使用者私人物品或真實品牌商品。各生成一次，沒有另做 variants；兩張也可由加入頁的範例按鈕使用。

- `public/test-black-tshirt.png`
  - Prompt: `Use case: product-mockup; Asset type: standalone raster catalog test fixture for 3D wardrobe image import; plain black short sleeve crewneck T-shirt front flatlay, pure white background, realistic cotton and subtle wrinkles, square overhead perpendicular, centered upright entire sleeves/neck/hem visible small margin, soft even light restrained shadow, no graphics/text/hanger/person/mannequin/props/watermark.`
- `public/test-print-tshirt.png`
  - Prompt brief: 同樣構圖的白色短袖圓領 T，胸前置中 LARGE clear RED geometric sunburst，下面 bold uppercase red sans-serif exact “STUDIO”，清晰印花；無其他文字、圖案、人、衣架、道具、水印。

實作參考 Three.js 官方的 [Material](https://threejs.org/docs/pages/Material.html) 與 [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html) 文件。這些 API 提供材質與著色器擴充，不提供照片到服裝的自動重建。
