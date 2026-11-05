import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { APP_NAME } from "@/lib/rules";
import "./globals.css";

// 본문용 글꼴. 한글 글꼴은 파일이 많아 필요한 글자 조각만 그때그때 불러온다.
const notoSans = Noto_Sans_KR({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "압류재산 공매 업무를 위한 판례 요약·해석 서비스 (참고용)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
