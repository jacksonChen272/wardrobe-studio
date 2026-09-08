import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '衣櫥實驗室｜自由搭配你的衣服', description: '上傳衣服、褲子、鞋子和配飾，自由拖曳、旋轉與縮放，組合出今天的穿搭。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><body>{children}</body></html>; }
