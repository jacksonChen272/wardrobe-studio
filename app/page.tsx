'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImagePlus, Layers3, RotateCcw, RotateCw, Shirt, Trash2, Upload, X } from 'lucide-react';
import { Avatar3D } from '@/components/avatar-3d';

type Category = '上衣' | '下身' | '鞋子' | '配飾';
type WardrobeItem = { id: string; name: string; category: Category; src: string };
type CanvasItem = WardrobeItem & { instanceId: string; x: number; y: number; rotation: number; scale: number; z: number };
const categories: Array<Category | '全部'> = ['全部', '上衣', '下身', '鞋子', '配飾'];
const sample: WardrobeItem = { id: 'sample-jacket', name: '藍色短版外套', category: '上衣', src: './sample-jacket.png' };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('wardrobe-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readItems() { const db = await openDb(); return new Promise<WardrobeItem[]>((resolve, reject) => { const r = db.transaction('items').objectStore('items').getAll(); r.onsuccess = () => resolve(r.result as WardrobeItem[]); r.onerror = () => reject(r.error); }); }
async function storeItem(item: WardrobeItem) { const db = await openDb(); db.transaction('items', 'readwrite').objectStore('items').put(item); }
async function deleteItem(id: string) { const db = await openDb(); db.transaction('items', 'readwrite').objectStore('items').delete(id); }
function fileUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('無法讀取圖片')); reader.onerror = reject; reader.readAsDataURL(file); }); }

export default function Home() {
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([sample]);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | '全部'>('全部');
  const [uploadCategory, setUploadCategory] = useState<Category>('上衣');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modelAngle, setModelAngle] = useState(0);
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [notice, setNotice] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const spinGesture = useRef<{ startX: number; startAngle: number } | null>(null);

  useEffect(() => { readItems().then((items) => setWardrobe([sample, ...items])).catch(() => undefined); }, []);
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: unknown) => void } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try { context.registerTool({ name: 'clear_outfit', title: '清空目前搭配', description: '移除搭配畫布上的所有單品，保留衣櫥內的照片。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { setCanvasItems([]); setSelectedId(null); return { cleared: true }; } }, { signal: controller.signal }); } catch {}
    return () => controller.abort();
  }, []);

  const filtered = activeCategory === '全部' ? wardrobe : wardrobe.filter((item) => item.category === activeCategory);
  const selected = canvasItems.find((item) => item.instanceId === selectedId);
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2200); };
  const addToCanvas = useCallback((item: WardrobeItem) => {
    const rect = canvasRef.current?.getBoundingClientRect(); const count = canvasItems.length;
    const height = rect?.height ?? 600;
    const fit = item.category === '上衣' ? { y: height * .38, scale: .78 } : item.category === '下身' ? { y: height * .62, scale: .9 } : item.category === '鞋子' ? { y: height * .86, scale: .62 } : { y: height * .25, scale: .55 };
    const next: CanvasItem = { ...item, instanceId: `${item.id}-${Date.now()}`, x: Math.max(90, (rect?.width ?? 600) / 2 + (count % 2 ? 8 : 0)), y: fit.y, rotation: 0, scale: fit.scale, z: count + 1 };
    setCanvasItems((current) => [...current, next]); setSelectedId(next.instanceId);
  }, [canvasItems.length]);
  const updateSelected = (patch: Partial<CanvasItem>) => { if (selectedId) setCanvasItems((items) => items.map((item) => item.instanceId === selectedId ? { ...item, ...patch } : item)); };
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = [...files].filter((file) => file.type.startsWith('image/')).slice(0, 12);
    const items = await Promise.all(accepted.map(async (file) => ({ id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), category: uploadCategory, src: await fileUrl(file) })));
    for (const item of items) await storeItem(item);
    setWardrobe((current) => [...current, ...items]); flash(`已加入 ${items.length} 件單品`);
  };
  const removeFromWardrobe = async (item: WardrobeItem) => { if (item.id === sample.id) return; await deleteItem(item.id); setWardrobe((current) => current.filter((entry) => entry.id !== item.id)); setCanvasItems((current) => current.filter((entry) => entry.id !== item.id)); };
  const moveDrag = (event: React.PointerEvent) => { const spin = spinGesture.current; if (spin) setModelAngle(Math.max(-70, Math.min(70, spin.startAngle + (event.clientX - spin.startX) * .45))); };
  const startSpin = (event: React.PointerEvent) => { if ((event.target as HTMLElement).closest('.canvas-item, .spin-button')) return; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); spinGesture.current = { startX: event.clientX, startAngle: modelAngle }; };
  const endPointer = () => { spinGesture.current = null; };
  const exportOutfit = async () => {
    if (!canvasRef.current || !canvasItems.length) { flash('先加入幾件單品再匯出'); return; }
    const rect = canvasRef.current.getBoundingClientRect(); const canvas = document.createElement('canvas'); canvas.width = Math.round(rect.width * 2); canvas.height = Math.round(rect.height * 2); const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(2, 2); ctx.fillStyle = '#ebe9e2'; ctx.fillRect(0, 0, rect.width, rect.height);
    const mannequin = new Image(); mannequin.src = './mannequin.png'; await mannequin.decode(); const mannequinHeight = rect.height * .9; const mannequinWidth = mannequin.width * (mannequinHeight / mannequin.height); ctx.globalAlpha = .92; ctx.drawImage(mannequin, rect.width / 2 - mannequinWidth / 2, rect.height * .05, mannequinWidth, mannequinHeight); ctx.globalAlpha = 1;
    for (const item of [...canvasItems].sort((a, b) => a.z - b.z)) { const img = new Image(); img.src = item.src; await img.decode(); const size = 210 * item.scale; ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.rotation * Math.PI / 180); const ratio = Math.min(size / img.width, size / img.height); ctx.drawImage(img, -img.width * ratio / 2, -img.height * ratio / 2, img.width * ratio, img.height * ratio); ctx.restore(); }
    const link = document.createElement('a'); link.download = `我的搭配-${new Date().toISOString().slice(0, 10)}.png`; link.href = canvas.toDataURL('image/png'); link.click(); flash('搭配圖片已下載');
  };

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Shirt size={20}/></span><span>衣櫥實驗室</span></div><div className="top-actions"><button className="ghost-button" onClick={() => { setCanvasItems([]); setSelectedId(null); }}><RotateCcw size={17}/>清空</button><button className="primary-button" onClick={exportOutfit}><ArrowDownToLine size={17}/>儲存搭配</button></div></header>
    <section className="workspace">
      <aside className="wardrobe-panel">
        <div className="panel-heading"><div><p className="eyebrow">MY WARDROBE</p><h1>我的衣櫥</h1></div><label className="icon-button upload-icon" aria-label="上傳衣物照片"><Upload size={19}/><input type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)}/></label></div>
        <div className="category-row" aria-label="衣物分類">{categories.map((category) => <button key={category} className={activeCategory === category ? 'active' : ''} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
        <div className="category-picker"><span>上傳分類</span><select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as Category)}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></div>
        <label className="upload-zone"><input type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)}/><ImagePlus size={22}/><span>加入衣服照片</span><small>JPG、PNG、WEBP</small></label>
        <div className="wardrobe-grid">{filtered.map((item) => <article className="wardrobe-card" key={item.id}><button className="item-preview" onClick={() => addToCanvas(item)} aria-label={`加入${item.name}到搭配`}>{/* oxlint-disable-next-line next/no-img-element */}<img src={item.src} alt={item.name}/></button><div><span>{item.name}</span><small>{item.category}</small></div>{item.id !== sample.id && <button className="delete-item" aria-label={`刪除${item.name}`} onClick={() => removeFromWardrobe(item)}><X size={14}/></button>}</article>)}</div>
      </aside>
      <section className="studio-panel">
        <div className="studio-title"><div><p className="eyebrow">3D VIRTUAL FITTING</p><h2>3D 模特兒試穿</h2></div><div className="model-options"><div className="gender-switch" aria-label="選擇模特兒"><button className={gender === 'female' ? 'active' : ''} onClick={() => setGender('female')}>女生</button><button className={gender === 'male' ? 'active' : ''} onClick={() => setGender('male')}>男生</button></div><p>點選衣物自動貼合；左右滑動旋轉 3D 模特兒。</p></div></div>
        <div ref={canvasRef} className="outfit-canvas" onPointerDown={startSpin} onPointerMove={moveDrag} onPointerUp={endPointer} onPointerCancel={endPointer} onPointerLeave={endPointer}>
          <div className="canvas-grid"/>
          <Avatar3D gender={gender} angle={modelAngle} garments={canvasItems}/>
          {!canvasItems.length && <div className="fit-hint"><h3>為模特兒換上第一件衣服</h3><button onClick={() => addToCanvas(sample)}>試穿藍色外套</button></div>}
          <button className="spin-button spin-left" aria-label="向左旋轉模特兒" onClick={() => setModelAngle((angle) => Math.max(-70, angle - 15))}><ChevronLeft/></button><button className="spin-button spin-right" aria-label="向右旋轉模特兒" onClick={() => setModelAngle((angle) => Math.min(70, angle + 15))}><ChevronRight/></button>
          <div className="spin-status">左右滑動旋轉 · {Math.round(modelAngle)}°</div>
          <div className="canvas-label"><Layers3 size={15}/>{canvasItems.length} 件單品</div>
        </div>
        <div className={`control-dock ${selected ? '' : 'disabled'}`}>
          <div className="selection-name"><span className="selection-swatch"/><div><small>已選取</small><strong>{selected?.name ?? '尚未選取單品'}</strong></div></div>
          <div className="control-group"><button aria-label="向左旋轉" onClick={() => updateSelected({ rotation:(selected?.rotation ?? 0)-15 })}><RotateCcw size={19}/></button><label><span>旋轉</span><input aria-label="旋轉角度" type="range" min="-180" max="180" value={selected?.rotation ?? 0} onChange={(e) => updateSelected({ rotation:Number(e.target.value) })}/></label><button aria-label="向右旋轉" onClick={() => updateSelected({ rotation:(selected?.rotation ?? 0)+15 })}><RotateCw size={19}/></button></div>
          <div className="control-group scale-control"><span className="small-a">A</span><input aria-label="縮放尺寸" type="range" min="0.35" max="2" step="0.05" value={selected?.scale ?? 1} onChange={(e) => updateSelected({ scale:Number(e.target.value) })}/><span className="large-a">A</span></div>
          <div className="stack-actions"><button aria-label="移到上層" onClick={() => updateSelected({ z:Math.max(0,...canvasItems.map((i) => i.z))+1 })}><ChevronUp size={18}/></button><button aria-label="移到下層" onClick={() => updateSelected({ z:Math.min(...canvasItems.map((i) => i.z))-1 })}><ChevronDown size={18}/></button><button className="danger" aria-label="從搭配移除" onClick={() => { setCanvasItems((items) => items.filter((i) => i.instanceId !== selectedId)); setSelectedId(null); }}><Trash2 size={18}/></button></div>
        </div>
      </section>
    </section>{notice && <output className="toast" aria-live="polite">{notice}</output>}
  </main>;
}
