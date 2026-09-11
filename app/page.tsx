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
} from '@/lib/wardrobe';
import { AddGarment } from '@/components/add-garment';
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
    [adding, setAdding] = useState(false);
  const view = useRef<ViewHandle>(null),
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
  const saveImported = async (item: Garment) => {
    await saveGarment(item);
    setItems((a) => [...a, item]);
    setOutfit((o) => ({ ...o, [item.category]: item.id }));
    setDrawer(null);
    setNotice('已加入衣櫥並換上。照片只儲存在這台裝置。');
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
        <button
          className="add-wardrobe-entry"
          disabled={mode === 'inspect'}
          onClick={() => setAdding(true)}
        >
          <Plus size={18} />
          加入衣櫥
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
          <p className="approx-note">正面保留商品圖案，側背面為近似布料。</p>
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
      {drawer && (
        <Dialog
          open={!adding}
          onOpenChange={(open) => {
            if (!open) setDrawer(null);
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
            <button className="upload-button" onClick={() => setAdding(true)}>
              <Plus size={18} />
              加入衣櫥：上傳 / 拖曳 / 圖片網址
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
      {adding && (
        <AddGarment
          open
          onClose={() => setAdding(false)}
          onSave={saveImported}
          selected={selected}
        />
      )}
    </main>
  );
}
