'use client';
import { lazy, Suspense, useState, useRef, useMemo, useCallback } from 'react';
import { Upload, Plus, X, ArrowLeft, Check, ImagePlus } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import {
  CATEGORIES,
  labels,
  templates,
  templateCategory,
  type Garment,
  type Template,
  type GarmentShape,
} from '@/lib/wardrobe';
import { defaultShape, shapeFromSilhouette } from '@/lib/garment-analysis';
import {
  prepareAppearance,
  importImageUrl,
  correctMask,
  previewGarment,
  type AppearanceDraft,
} from '@/lib/appearance-pipeline';
const Preview = lazy(() =>
  import('./avatar-3d').then((m) => ({ default: m.Avatar3D })),
);
type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (g: Garment) => Promise<void>;
  selected: Garment[];
};
export function AddGarment({ open, onClose, onSave, selected }: Props) {
  const [draft, setDraft] = useState<AppearanceDraft | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [url, setUrl] = useState(''),
    [name, setName] = useState(''),
    [template, setTemplate] = useState<Template>('tshirt'),
    [shape, setShape] = useState<GarmentShape>(defaultShape('tshirt')),
    [editing, setEditing] = useState(false),
    [points, setPoints] = useState<[number, number][]>([]),
    [angle, setAngle] = useState(0),
    [dragging, setDragging] = useState(false),
    [ready, setReady] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false),
    alive = useRef(true);
  const accept = async (
    file?: File,
    sourceType: 'upload' | 'product' = 'upload',
  ) => {
    if (!file || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const d = await prepareAppearance(file, sourceType);
      if (!alive.current) return;
      setDraft(d);
      setName(d.name);
      setTemplate(d.detected.template);
      setShape(shapeFromSilhouette(d.silhouette, d.detected.template));
      setPoints([]);
      setEditing(d.requiresMask);
      setAngle(0);
      setReady(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '圖片無法讀取。');
    } finally {
      lock.current = false;
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const garment = useMemo(
    () => (draft ? previewGarment(draft, name, template, shape) : null),
    [draft, name, template, shape],
  );
  const previewItems = useMemo(
    () =>
      garment
        ? CATEGORIES.map((c) =>
            c === garment.category
              ? garment
              : selected.find((g) => g.category === c)!,
          )
        : selected,
    [garment, selected],
  );
  const onReady = useCallback(() => setReady(true), []);
  const loadUrl = async (value: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const file = await importImageUrl(value);
      lock.current = false;
      await accept(file, 'product');
    } catch (e) {
      setError(e instanceof Error ? e.message : '圖片網址無法讀取。');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const chooseTemplate = (t: Template) => {
    setTemplate(t);
    setShape(
      draft ? shapeFromSilhouette(draft.silhouette, t) : defaultShape(t),
    );
  };
  const close = () => {
    if (busy) return;
    alive.current = false;
    onClose();
  };
  const save = async () => {
    if (!garment || !draft || draft.requiresMask || busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ ...garment, id: crypto.randomUUID() });
      onClose();
    } catch {
      setError('衣櫥儲存失敗，請檢查裝置空間後重試。');
    } finally {
      setBusy(false);
    }
  };
  const changeShape = (key: keyof GarmentShape, value: number) =>
    setShape((s) => ({ ...s, [key]: value }));
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="add-garment-dialog"
        aria-label={draft ? '確認衣物並預覽' : '加入衣櫥'}
      >
        <div className="sheet-heading">
          <div>
            <span className="step-kicker">
              {draft ? '02 / 確認後才會儲存' : '01 / 加入你的單品'}
            </span>
            <DialogTitle>{draft ? '確認衣物與試穿' : '加入衣櫥'}</DialogTitle>
          </div>
          <button aria-label="關閉加入衣櫥" disabled={busy} onClick={close}>
            <X />
          </button>
        </div>
        <input
          type="file"
          hidden
          ref={input}
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void accept(e.target.files?.[0])}
        />
        {error && (
          <div role="alert" className="import-error">
            {error}
          </div>
        )}
        {!draft ? (
          <div className="input-options">
            <button
              className={`dropzone ${dragging ? 'drag-over' : ''}`}
              disabled={busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.[0])
                  void accept(e.dataTransfer.files[0]);
                else {
                  const dropped = (
                    e.dataTransfer.getData('text/uri-list') ||
                    e.dataTransfer.getData('text/plain')
                  )
                    .split('\n')
                    .find((v) => v && !v.startsWith('#'));
                  if (dropped) {
                    setUrl(dropped);
                    void loadUrl(dropped);
                  } else setError('請拖入圖片檔案，或貼上圖片網址。');
                }
              }}
            >
              <Upload size={30} />
              <strong>
                {busy ? '正在分析圖片…' : '上傳圖片，或將圖片拖到這裡'}
              </strong>
              <span>手機相簿 / 電腦檔案 · JPG、PNG、WEBP · 最大15MB</span>
            </button>
            <form
              className="url-import"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError('');
                try {
                  await loadUrl(url);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : '圖片網址無法讀取。',
                  );
                  setBusy(false);
                }
              }}
            >
              <label htmlFor="product-image-url">貼上商品圖片 URL</label>
              <div>
                <input
                  id="product-image-url"
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/item.jpg"
                  disabled={busy}
                />
                <button className="primary" disabled={busy || !url.trim()}>
                  讀取圖片
                </button>
              </div>
              <p>
                若網站不允許直接讀取，下載圖片後上傳即可；不會清掉你輸入的網址。
              </p>
            </form>
            <div className="import-examples">
              <p>先用範例看看圖案如何保留</p>
              {[
                ['黑色素 T', 'test-black-tshirt.png'],
                ['紅色印花白 T', 'test-print-tshirt.png'],
                ['藍色外套', 'sample-jacket.png'],
              ].map(([label, path]) => (
                <button
                  disabled={busy}
                  key={path}
                  onClick={async () => {
                    setError('');
                    try {
                      const r = await fetch('./' + path);
                      if (!r.ok) throw Error();
                      await accept(
                        new File(
                          [await r.blob()],
                          label +
                            (path === 'sample-jacket.png'
                              ? '.png'
                              : '-tshirt.png'),
                          {
                            type: 'image/png',
                          },
                        ),
                      );
                    } catch {
                      setError('範例無法讀取，請改用上傳。');
                    }
                  }}
                >
                  <ImagePlus size={17} />
                  {label}
                </button>
              ))}
            </div>
            <p className="privacy-note">
              照片保存在此瀏覽器，不上傳到第三方去背服務。平拍 /
              白底可自動估計；真人或雜亂背景請在下一步修正輪廓。
            </p>
          </div>
        ) : (
          <>
            <div className="confirm-grid">
              <section className="image-review">
                <h3>原始圖片</h3>
                <div
                  className={`mask-editor ${editing ? 'editing' : ''}`}
                  style={{
                    aspectRatio: draft.width / draft.height,
                    maxHeight: 'none',
                  }}
                >
                  <img src={draft.source} alt="原始商品圖片" />
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-label="點選衣服輪廓"
                    onClick={(e) => {
                      if (!editing || busy) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setPoints((p) => [
                        ...p,
                        [
                          (e.clientX - r.left) / r.width,
                          (e.clientY - r.top) / r.height,
                        ],
                      ]);
                    }}
                  >
                    {points.length > 0 && (
                      <polygon
                        points={points
                          .map(([x, y]) => `${x * 100},${y * 100}`)
                          .join(' ')}
                      />
                    )}{' '}
                    {points.map(([x, y], i) => (
                      <circle key={i} cx={x * 100} cy={y * 100} r=".7" />
                    ))}
                  </svg>
                </div>
                <div className="mask-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing((v) => !v);
                      setPoints([]);
                    }}
                  >
                    {editing ? '取消輪廓編輯' : '修正去背 / 人物分離'}
                  </button>
                  {editing && (
                    <>
                      <button
                        disabled={!points.length || busy}
                        onClick={() => setPoints((p) => p.slice(0, -1))}
                      >
                        撤回一點
                      </button>
                      <button
                        disabled={points.length < 3 || busy}
                        onClick={async () => {
                          setBusy(true);
                          setError('');
                          try {
                            const d = await correctMask(draft, points);
                            setDraft(d);
                            setShape(
                              shapeFromSilhouette(d.silhouette, template),
                            );
                            setEditing(false);
                            setPoints([]);
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : '輪廓處理失敗。',
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        套用輪廓
                      </button>
                    </>
                  )}
                </div>
                {editing && (
                  <p>沿衣服外緣依序點選，避開臉、手與背景；至少3點後套用。</p>
                )}
                <h3>去背後衣服</h3>
                <div className="cutout-preview">
                  <img src={draft.processed} alt="去背後衣物" />
                </div>
                <p className={draft.requiresMask ? 'needs-review' : ''}>
                  {draft.requiresMask
                    ? '目前無法可靠分離衣服，請先修正輪廓。'
                    : draft.appearance.method === 'manual-polygon'
                      ? '已套用你選擇的衣服輪廓。'
                      : '已完成初步去背，請檢查是否包含衣架或人物。'}
                </p>
              </section>
              <section className="preview-review">
                <h3>3D 試穿預覽</h3>
                <div className="import-3d">
                  <Suspense fallback={<p>載入3D預覽…</p>}>
                    <Preview
                      garments={previewItems}
                      mode="inspect"
                      angle={angle}
                      zoom={1}
                      onReady={onReady}
                    />
                  </Suspense>
                </div>
                <div className="preview-angles">
                  {[
                    ['正面', 0],
                    ['左前', -Math.PI / 4],
                    ['側面', Math.PI / 2],
                    ['背面', Math.PI],
                  ].map(([label, a]) => (
                    <button key={label} onClick={() => setAngle(Number(a))}>
                      {label}
                    </button>
                  ))}
                </div>
                <p>
                  正面保留原圖的印花、文字及明暗；側背面為近似布料，不複製胸前圖案。
                </p>
              </section>
              <section className="garment-fields">
                <label>
                  衣服名稱
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  衣物分類
                  <select
                    value={templateCategory(template)}
                    onChange={(e) =>
                      chooseTemplate(
                        e.target.value === 'top'
                          ? 'tshirt'
                          : e.target.value === 'bottom'
                            ? 'pants'
                            : 'sneakers',
                      )
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {labels[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  判斷類型 / 版型
                  <select
                    value={template}
                    onChange={(e) => chooseTemplate(e.target.value as Template)}
                  >
                    {Object.entries(templates)
                      .filter(
                        ([t]) =>
                          templateCategory(t as Template) ===
                          templateCategory(template),
                      )
                      .map(([t, label]) => (
                        <option key={t} value={t}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  {draft.detected.reason}（信心
                  {Math.round(draft.detected.confidence * 100)}%）。
                </p>
                <div className="detected-colors">
                  {draft.colors.map((c) => (
                    <span title={c} key={c} style={{ background: c }} />
                  ))}
                </div>
                <details>
                  <summary>調整輪廓與版型</summary>
                  {templateCategory(template) === 'top' ? (
                    <>
                      <label>
                        衣長
                        <Slider
                          aria-label="衣長"
                          min={0.9}
                          max={1.06}
                          step={0.01}
                          value={[shape.hem]}
                          onValueChange={(v) =>
                            changeShape('hem', Array.isArray(v) ? v[0] : v)
                          }
                        />
                      </label>
                      <label>
                        袖長
                        <Slider
                          aria-label="袖長"
                          min={0.29}
                          max={0.52}
                          step={0.01}
                          value={[shape.sleeve]}
                          onValueChange={(v) =>
                            changeShape('sleeve', Array.isArray(v) ? v[0] : v)
                          }
                        />
                      </label>
                      <label>
                        寬鬆度
                        <Slider
                          aria-label="寬鬆度"
                          min={0}
                          max={0.045}
                          step={0.003}
                          value={[shape.ease]}
                          onValueChange={(v) =>
                            changeShape('ease', Array.isArray(v) ? v[0] : v)
                          }
                        />
                      </label>
                      <label>
                        領口
                        <select
                          value={shape.neck}
                          onChange={(e) =>
                            setShape((s) => ({
                              ...s,
                              neck: e.target.value as GarmentShape['neck'],
                            }))
                          }
                        >
                          <option value="crew">圓領</option>
                          <option value="v">V領</option>
                          <option value="collar">翻領</option>
                        </select>
                      </label>
                    </>
                  ) : templateCategory(template) === 'bottom' ? (
                    <label>
                      {template === 'skirt' ? '裙襬寬度' : '褲管寬度'}
                      <Slider
                        aria-label="下襬寬度"
                        min={1}
                        max={1.5}
                        step={0.05}
                        value={[
                          template === 'skirt' ? shape.flare : shape.legWidth,
                        ]}
                        onValueChange={(v) =>
                          changeShape(
                            template === 'skirt' ? 'flare' : 'legWidth',
                            Array.isArray(v) ? v[0] : v,
                          )
                        }
                      />
                    </label>
                  ) : (
                    <p>運動鞋與休閒鞋採不同鞋底高度與鞋面細節。</p>
                  )}
                </details>
                <div className="confirmation-note">
                  <Check size={16} />
                  確認前不會加入衣櫥，也不會改動目前穿搭。
                </div>
                <button
                  className="primary"
                  disabled={busy || draft.requiresMask || !ready}
                  onClick={() => void save()}
                >
                  <Plus size={18} />
                  {busy ? '處理中…' : '確認加入衣櫥'}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    setError('');
                  }}
                >
                  <ArrowLeft size={16} />
                  換一張圖片
                </button>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
