// Design Ref: §3 화면 구성 — 접속 화면과 메인 화면이 함께 쓰는 열쇠 구멍 로고

import { APP_NAME } from "@/lib/rules";

export default function BrandLogo() {
  return (
    <span className="logo">
      <span className="logo__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="9.5" r="5" stroke="#030712" strokeWidth="2.6" />
          <rect x="10.7" y="13" width="2.6" height="8" rx="1.3" fill="#030712" />
        </svg>
      </span>
      <span className="logo__word">{APP_NAME}</span>
    </span>
  );
}
