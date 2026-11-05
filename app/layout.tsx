import type { Metadata } from "next";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

// 본문용 글꼴. 한글 글꼴은 파일이 많아 필요한 글자 조각만 그때그때 불러온다.
const notoSans = Noto_Sans_KR({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  preload: false,
});

// 앱 제목에만 쓰는 글꼴
const notoSerif = Noto_Serif_KR({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: "공매 판례분석 도우미",
  description: "압류재산 공매 업무를 위한 판례 요약·해석 도우미 (참고용)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
