"use client";

// Design Ref: §3 화면 구성 A — 접속 코드 입력
// Plan SC: 작업 10 접속 코드

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthResponse } from "@/app/api/auth/route";
import { TRY_AGAIN_NOTICE } from "@/lib/rules";
import HeroVideo from "./HeroVideo";

export default function AccessGate() {
  const router = useRouter();
  const [code, setCode] = useState("");
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
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-background">
      <HeroVideo />
      {/* 제목이 잘 읽히도록 까는 어두운 막. 빛의 문은 어두워지지 않게 가장자리만 덮는다. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.6),transparent_20%)] lg:bg-[linear-gradient(to_right,rgb(0_0_0/0.6),transparent_40%)]"
      />

      {/* 넓은 화면에서는 빛의 문이 가운데에 보이도록 왼쪽 어두운 영역에 모아 둔다. */}
      <div className="fade-in relative flex flex-1 flex-col justify-between gap-8 p-6 lg:max-w-[26rem] lg:justify-center lg:p-10">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-light lg:text-3xl">
            공매 판례분석 도우미
          </h1>
          <p className="mt-2 text-sm text-foreground">참고용 서비스</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-sm flex-col gap-3 self-center rounded-xl border border-line bg-black/85 p-6 backdrop-blur-md lg:self-start lg:bg-black/70"
        >
          <label htmlFor="access-code" className="text-sm font-medium">
            접속 코드
          </label>
          <input
            id="access-code"
            name="access-code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="field"
          />
          {message !== "" && (
            <p role="alert" className="text-sm text-error-text">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={code === "" || isChecking}
            className="btn-light"
          >
            {isChecking ? "확인 중…" : "입장"}
          </button>
        </form>
      </div>
    </div>
  );
}
