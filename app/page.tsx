'use client';
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  lazy,
  Suspense,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Shuffle,
  X,
  Minus,
  RotateCcw,
} from 'lucide-react';
import type { ViewHandle } from '@/components/avatar-3d';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  samples,
  initialOutfit,
  CATEGORIES,
  labels,
  templates,
  cycle,
  acceptedSwipe,
  loadGarments,
  saveGarment,
  type Category,
  type Garment,
  type Mode,
  type Template,
} from '@/lib/wardrobe';
import {
  prepareImport,
  finishImport,
  fabricSwatch,
  type ImportDraft,
} from '@/lib/import-pipeline';
const View = lazy(() =>
  import('@/components/avatar-3d').then((m) => ({ default: m.Avatar3D })),
);

export default function Home() {
  const [items, setItems] = useState<Garment[]>(samples),
    [outfit, setOutfit] = useState(initialOutfit),
    [mode, setMode] = useState<Mode>('builder'),
    [angle, setAngle] = useState(0),
    [zoom, setZoom] = useState(1),
    [ready, setReady] = useState(false),
    [drawer, setDrawer] = useState<Category | null>(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<ImportDraft | null>(null),
    [name, setName] = useState(''),
    [template, setTemplate] = useState<Template>('tshirt'),
    [color, setColor] = useState('#555555'),
    [swatch, setSwatch] = useState<string | null>(null),
    [sampling, setSampling] = useState(false);
  const view = useRef<ViewHandle>(null),
    fileInput = useRef<HTMLInputElement>(null),
    surface = useRef<HTMLDivElement>(null),
    gesture = useRef<{
      id: number;
      x: number;
      y: number;
      category: Category | null;
      angle: number;
      mode: Mode;
    } | null>(null),
    touches = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const selected = useMemo(
    () =>
      CATEGORIES.map(
        (c) =>
          items.find((i) => i.id === outfit[c]) ??
          samples.find((i) => i.category === c)!,
      ),
    [items, outfit],
  );
  useEffect(() => {
    loadGarments()
      .then((g) => setItems([...samples, ...g]))
      .catch(() => setNotice('無法讀取本機衣櫥；仍可試用內建穿搭。'));
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  const change = useCallback(
    (c: Category, d: number) => {
      setOutfit((o) => cycle(o, items, c, d));
    },
    [items],
  );
  const resetGesture = () => {
    gesture.current = null;
    touches.current.clear();
    pinch.current = null;
  };
  const switchMode = (m: Mode) => {
    resetGesture();
    setAngle(0);
    setZoom(1);
    setMode(m);
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready || (e.target as HTMLElement).closest('button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size > 1) {
      gesture.current = null;
      if (mode === 'inspect') {
        const [a, b] = [...touches.current.values()];
        pinch.current = {
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          zoom,
        };
      }
      return;
    }
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      category: view.current?.zone((e.clientY - r.top) / r.height) ?? null,
      angle,
      mode,
    };
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'inspect' && pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      setZoom(
        Math.max(
          0.8,
          Math.min(
            1.8,
            (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
              pinch.current.distance,
          ),
        ),
      );
      return;
    }
    const g = gesture.current;
    if (g?.mode === 'inspect' && mode === 'inspect')
      setAngle(g.angle + (e.clientX - g.x) * 0.009);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (
      g &&
      g.id === e.pointerId &&
      g.mode === 'builder' &&
      mode === 'builder' &&
      g.category &&
      acceptedSwipe(
        e.clientX - g.x,
        e.clientY - g.y,
        e.currentTarget.clientWidth,
      )
    )
      change(g.category, e.clientX < g.x ? 1 : -1);
    resetGesture();
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setNotice('');
    try {
      const d = await prepareImport(file);
      setDraft(d);
      setColor(d.color);
      setName(file.name.replace(/\.[^.]+$/, ''));
      setTemplate(
        drawer === 'bottom'
          ? 'pants'
          : drawer === 'shoes'
            ? 'sneakers'
            : 'tshirt',
      );
      setSwatch(null);
      setSampling(false);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '圖片無法讀取');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const confirmImport = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const item = finishImport(draft, name, template, color, swatch);
      await saveGarment(item);
      setItems((a) => [...a, item]);
      setOutfit((o) => ({ ...o, [item.category]: item.id }));
      setDraft(null);
      setDrawer(null);
      setNotice('已加入衣櫥並換上。照片僅儲存在這台裝置。');
    } catch {
      setNotice('儲存失敗，可能是裝置空間不足。請重試。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="studio" data-mode={mode}>
      <header>
        <a className="wordmark" href="./">
          WARDROBE<span>穿搭實驗室</span>
        </a>
        <button
          className="wardrobe-open"
          disabled={mode === 'inspect'}
          onClick={() => setDrawer('top')}
        >
          我的衣櫥 <Plus size={16} />
        </button>
      </header>
      <section className="experience">
        <div className="intro">
          <p className="eyebrow">
            {mode === 'builder' ? '01 / BUILD YOUR LOOK' : '02 / EVERY ANGLE'}
          </p>
          <h1>
            {mode === 'builder' ? '今天，想穿什麼？' : '讓穿搭，轉個身。'}
          </h1>
          <p>
            {mode === 'builder'
              ? '在上衣、下身、鞋子的位置左右滑，找到喜歡的組合。'
              : '左右拖曳檢視側面，衣服會保持這一套。'}
          </p>
        </div>
        <div
          className="stage"
          ref={surface}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={resetGesture}
          onLostPointerCapture={resetGesture}
          onWheel={(e) => {
            if (mode === 'inspect')
              setZoom((z) =>
                Math.max(0.8, Math.min(1.8, z - e.deltaY * 0.001)),
              );
          }}
          aria-label={mode === 'builder' ? '分區滑動換衣服' : '拖曳旋轉穿搭'}
          tabIndex={0}
        >
          <Suspense
            fallback={<div className="scene-status">正在準備試衣間…</div>}
          >
            <View
              ref={view}
              mode={mode}
              angle={angle}
              zoom={zoom}
              garments={selected}
              onReady={onReady}
            />
          </Suspense>
          <div className="mode-label">
            <span />
            {mode === 'builder' ? '快速穿搭 · 正面固定' : '3D 檢視 · 拖曳旋轉'}
          </div>
          {mode === 'builder' && (
            <div className="zone-guides" aria-hidden="true">
              <span>上衣 ↔</span>
              <span>下身 ↔</span>
              <span>鞋子 ↔</span>
            </div>
          )}
          {mode === 'inspect' && (
            <div className="view-controls">
              <button
                aria-label="縮小"
                onClick={() => setZoom((z) => Math.max(0.8, z - 0.15))}
              >
                <Minus size={17} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="放大"
                onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
              >
                <Plus size={17} />
              </button>
              <button
                aria-label="重設視角"
                onClick={() => {
                  setZoom(1);
                  setAngle(0);
                }}
              >
                <RotateCcw size={17} />
              </button>
            </div>
          )}
          {mode === 'inspect' && (
            <div className="angle-presets">
              {[
                ['左側', -Math.PI / 2],
                ['左前', -Math.PI / 4],
                ['正面', 0],
                ['右前', Math.PI / 4],
                ['右側', Math.PI / 2],
              ].map(([label, a]) => (
                <button key={label} onClick={() => setAngle(Number(a))}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className="look-list">
          <p className="eyebrow">THE EDIT / 你的搭配</p>
          {selected.map((g) => (
            <div
              className="look-row"
              key={g.category}
              data-category={g.category}
            >
              <button
                className="look-info"
                disabled={mode === 'inspect'}
                onClick={() => setDrawer(g.category)}
              >
                <span
                  className="color-chip"
                  style={{ background: g.dominantColors[0] }}
                />
                <span>
                  <small>
                    {labels[g.category]} · {templates[g.garmentTemplate]}
                  </small>
                  <strong>{g.name}</strong>
                </span>
              </button>
              {mode === 'builder' && (
                <div className="cycle-buttons">
                  <button
                    aria-label={`上一件${labels[g.category]}`}
                    onClick={() => change(g.category, -1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label={`下一件${labels[g.category]}`}
                    onClick={() => change(g.category, 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          ))}
          <p className="approx-note">版型為近似穿搭示意，側面延續布料色彩。</p>
        </aside>
        <footer>
          {mode === 'builder' ? (
            <>
              <button
                className="secondary"
                onClick={() =>
                  setOutfit(
                    (o) =>
                      Object.fromEntries(
                        CATEGORIES.map((c) => {
                          const list = items.filter((i) => i.category === c);
                          return [
                            c,
                            list[Math.floor(Math.random() * list.length)]?.id ??
                              o[c],
                          ];
                        }),
                      ) as typeof initialOutfit,
                  )
                }
              >
                <Shuffle size={17} />
                隨機搭配
              </button>
              <button
                className="primary"
                disabled={!ready}
                onClick={() => switchMode('inspect')}
              >
                查看穿搭 <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary"
                onClick={() => switchMode('builder')}
              >
                <ArrowLeft size={17} />
                繼續換裝
              </button>
              <button
                className="primary"
                onClick={() => view.current?.capture()}
              >
                <Download size={17} />
                儲存穿搭
              </button>
            </>
          )}
        </footer>
      </section>
      {notice && (
        <output className="notice" onClick={() => setNotice('')}>
          {notice}
        </output>
      )}
      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {drawer && (
        <Dialog
          open={!draft}
          onOpenChange={(open) => {
            if (!open && !busy) setDrawer(null);
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="closet-sheet"
            aria-label="我的衣櫥"
          >
            <div className="sheet-heading">
              <DialogTitle>我的衣櫥</DialogTitle>
              <button aria-label="關閉衣櫥" onClick={() => setDrawer(null)}>
                <X />
              </button>
            </div>
            <div className="category-tabs">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  aria-pressed={drawer === c}
                  onClick={() => setDrawer(c)}
                >
                  {labels[c]}
                </button>
              ))}
            </div>
            <button
              className="upload-button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <Plus size={18} />
              {busy ? '正在處理圖片…' : '上傳衣服 / 商品圖片'}
            </button>
            <p className="import-help">
              商品頁請先儲存圖片再上傳。支援白底、平拍及穿著照片；下一步選擇版型與布料。
            </p>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  const r = await fetch('./sample-jacket.png');
                  if (!r.ok) throw Error();
                  await importFile(
                    new File([await r.blob()], '範例藍外套.png', {
                      type: 'image/png',
                    }),
                  );
                } catch {
                  setNotice('範例照片無法載入，請改用上傳。');
                }
              }}
            >
              試用範例商品圖
            </button>
            <div className="closet-grid">
              {items
                .filter((g) => g.category === drawer)
                .map((g) => (
                  <button
                    className="closet-card"
                    key={g.id}
                    aria-pressed={outfit[g.category] === g.id}
                    onClick={() => {
                      setOutfit((o) => ({ ...o, [g.category]: g.id }));
                      setDrawer(null);
                    }}
                  >
                    <span
                      className="closet-thumb"
                      style={{ background: g.dominantColors[0] }}
                    >
                      {g.sourceImage && (
                        <img src={g.sourceImage} alt={g.name} />
                      )}
                    </span>
                    <strong>{g.name}</strong>
                    <small>{templates[g.garmentTemplate]}</small>
                  </button>
                ))}
            </div>
            <small>
              原有衣物資料保留在此裝置。配飾資料保留，暫不列入三件式穿搭。
            </small>
          </DialogContent>
        </Dialog>
      )}
      {draft && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setDraft(null);
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="import-sheet"
            aria-label="確認衣物外觀"
          >
            <div className="sheet-heading">
              <DialogTitle>確認衣物外觀</DialogTitle>
              <button
                aria-label="取消匯入"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                <X />
              </button>
            </div>
            <div className="import-columns">
              <div>
                <button
                  className={`source-preview ${sampling ? 'sampling' : ''}`}
                  aria-label="點選衣物布料取樣"
                  onClick={async (e) => {
                    if (!sampling) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const t = await fabricSwatch(
                      draft.source,
                      (e.clientX - rect.left) / rect.width,
                      (e.clientY - rect.top) / rect.height,
                    );
                    setSwatch(t);
                    setSampling(false);
                  }}
                >
                  <img src={draft.source} alt="原始衣服照片" />
                </button>
                <p>
                  {draft.method === 'manual'
                    ? '這張照片需要你選擇衣物布料區域。'
                    : draft.method === 'transparent'
                      ? '已辨識透明背景。'
                      : '已分離連接邊緣的單色背景，請確認衣物顏色。'}
                </p>
              </div>
              <div className="import-fields">
                <label>
                  單品名稱
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  選擇版型
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as Template)}
                  >
                    {Object.entries(templates).map(([t, l]) => (
                      <option key={t} value={t}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  布料主色
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value);
                      setSwatch(null);
                    }}
                  />
                </label>
                <button className="secondary" onClick={() => setSampling(true)}>
                  {sampling ? '請點照片中的衣服' : '從照片選布料區域'}
                </button>
                {swatch && (
                  <div className="swatch">
                    <img src={swatch} alt="取樣布料" />
                    <button onClick={() => setSwatch(null)}>改用純色</button>
                  </div>
                )}
                <p>
                  版型決定立體形狀；取樣區域決定布料紋理。請避開皮膚、衣架與背景。此版本不自動還原
                  Logo。
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void confirmImport()}
                >
                  {busy ? '儲存中…' : '加入衣櫥並試穿'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
