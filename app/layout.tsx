import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '衣櫥實驗室｜3D 穿搭',
  description:
    '上傳衣物照片，搭配立體服裝版型；分區滑動換裝，再旋轉檢視整體穿搭。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
