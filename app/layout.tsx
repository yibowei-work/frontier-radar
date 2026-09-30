import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://yibowei-work.github.io/frontier-radar/'),
  title: '前沿雷达｜AI 与机器人产品情报',
  description: '把全球 AI 与机器人动态，转化为产品判断和职业行动。',
  openGraph: {
    title: '前沿雷达｜AI 与机器人产品情报',
    description: '不是更多新闻，而是今天值得产品经理采取行动的行业信号。',
    url: 'https://yibowei-work.github.io/frontier-radar/',
    siteName: '前沿雷达',
    locale: 'zh_CN',
    type: 'website',
    images: [
      {
        url: 'https://yibowei-work.github.io/frontier-radar/og.png',
        width: 1200,
        height: 630,
        alt: '前沿雷达｜AI 与机器人产品情报',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '前沿雷达｜AI 与机器人产品情报',
    description: '把全球 AI 与机器人动态，转化为产品判断和职业行动。',
    images: ['https://yibowei-work.github.io/frontier-radar/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
