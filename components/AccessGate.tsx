"use client";

// Design Ref: §3 화면 구성 A — 접속 코드 입력
// Plan SC: 작업 10 접속 코드

import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import type { AuthResponse } from "@/app/api/auth/route";
import { REFERENCE_NOTICE, TRY_AGAIN_NOTICE } from "@/lib/rules";
import BrandLogo from "./BrandLogo";

// 카드에는 이 앱이 실제로 하는 일만 적는다.
const FEATURES = [
  {
    name: "판례 요약",
    badge: "요약",
    tone: "a",
    text: "쟁점과 관련된 판례를 법제처 자료에서 찾아, 판결 요지와 결론을 10줄 이내의 쉬운 말로 정리합니다.",
  },
  {
    name: "사건 적용 해석",
    badge: "해석",
    tone: "b",
    text: "판례가 입력한 쟁점에 어떻게 적용될 수 있는지 설명합니다. 근거 판례는 최대 5건까지 함께 보여 드립니다.",
  },
  {
    name: "근거 확인",
    badge: "근거",
    tone: "c",
    text: "사건번호와 선고일은 법제처 자료의 값을 표시하고, 원문에서 확인되지 않는 내용은 걸러 냅니다.",
  },
];

// 처음 나타나는 시점을 요소마다 다르게 준다.
function delay(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}

export default function AccessGate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [message, setMessage] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code === "" || isChecking) return;

    setIsChecking(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as AuthResponse;
      if (data.ok) {
        router.refresh(); // 서버가 쿠키를 확인해 메인 화면을 보여 준다
        return;
      }
      setMessage(data.message);
    } catch {
      setMessage(TRY_AGAIN_NOTICE);
    }
    setIsChecking(false);
  }

  return (
    <div className="gate">
      <aside className="gate-brand" aria-label="서비스 소개">
        <div className="gate-inset gate-top">
          <div className="e-settle">
            <BrandLogo />
          </div>
        </div>

        <div className="gate-brand__mid">
          <div className="gate-inset gate-hero">
            <h2 className="gate-hero__title">
              <span className="e-line">
                <span className="e-rise" style={delay(160)}>
                  판례 검토는 차분하게.
                </span>
              </span>
              <span className="e-line">
                <span className="e-rise" style={delay(250)}>
                  근거는 분명하게.
                </span>
              </span>
            </h2>
            <p className="gate-hero__copy e-settle" style={delay(470)}>
              법률 쟁점을 입력하면 관련 판례를 찾아 쉬운 말로 요약하고, 사건에
              어떻게 적용되는지 근거와 함께 보여 드립니다.
            </p>
          </div>

          <div className="gate-reel" aria-label="서비스 기능">
            <div className="gate-reel__track">
              {/* 끊김 없이 흐르도록 같은 카드를 세 번 잇는다. 뒤의 반복은 화면 읽기에서 뺀다. */}
              {[0, 1, 2].flatMap((round) =>
                FEATURES.map((feature, index) => (
                  <figure
                    key={`${round}-${feature.name}`}
                    className="gate-card e-lift"
                    style={delay(620 + (round * 3 + index) * 90)}
                    aria-hidden={round > 0 ? true : undefined}
                  >
                    <p className="gate-card__text">{feature.text}</p>
                    <figcaption className="gate-card__foot">
                      <span className="gate-card__name">{feature.name}</span>
                      <span
                        className={`gate-card__badge gate-card__badge--${feature.tone}`}
                        aria-hidden="true"
                      >
                        {feature.badge}
                      </span>
                    </figcaption>
                  </figure>
                )),
              )}
            </div>
          </div>

          <div className="gate-inset gate-sources e-fade" style={delay(1060)}>
            <div className="gate-sources__rule">
              <span className="gate-sources__label">근거로 삼는 자료</span>
            </div>
            <ul className="gate-sources__list">
              <li>대법원 판례</li>
              <li>국세징수법</li>
              <li>국세기본법</li>
              <li>민사집행법(준용)</li>
            </ul>
          </div>
        </div>

        <div className="gate-inset gate-bottom">
          <p className="gate-legal e-fade" style={delay(1280)}>
            {REFERENCE_NOTICE}
          </p>
        </div>
      </aside>

      <main className="gate-auth">
        <div className="gate-auth__main">
          <section className="gate-panel" aria-labelledby="gate-title">
            <div className="e-line">
              <h1 id="gate-title" className="gate-panel__title e-rise" style={delay(320)}>
                접속 코드 입력
              </h1>
            </div>
            <p className="gate-panel__sub e-settle" style={delay(430)}>
              공매 담당 직원만 이용할 수 있습니다.
            </p>

            <form className="gate-form" onSubmit={handleSubmit}>
              <div className="e-settle" style={delay(620)}>
                <label className="gate-label" htmlFor="access-code">
                  접속 코드
                </label>
                <div className="gate-control">
                  <svg
                    className="gate-control__icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    id="access-code"
                    name="access-code"
                    className="gate-input"
                    type={showCode ? "text" : "password"}
                    autoComplete="off"
                    placeholder="접속 코드를 입력하세요"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <button
                    type="button"
                    className="gate-reveal"
                    aria-label={showCode ? "접속 코드 숨기기" : "접속 코드 보기"}
                    aria-pressed={showCode}
                    aria-controls="access-code"
                    onClick={() => setShowCode((shown) => !shown)}
                  >
                    {showCode ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {message !== "" && (
                <p role="alert" className="gate-message">
                  {message}
                </p>
              )}

              <div className="e-settle" style={delay(840)}>
                <button
                  type="submit"
                  className="gate-submit"
                  disabled={code === "" || isChecking}
                >
                  {isChecking ? "확인 중…" : "입장"}
                </button>
              </div>
            </form>

            <p className="gate-note e-fade" style={delay(1080)}>
              접속 코드는 담당 관리자에게 문의해 주세요.
            </p>
          </section>
        </div>

        <p className="gate-auth__foot e-fade" style={delay(1160)}>
          참고용 서비스
        </p>
      </main>
    </div>
  );
}
