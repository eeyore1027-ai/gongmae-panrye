"use client";

// Design Ref: §3 화면 구성 A — 접속 코드 입력
// Plan SC: 작업 10 접속 코드

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthResponse } from "@/app/api/auth/route";
import { TRY_AGAIN_NOTICE } from "@/lib/rules";

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
    <form
      onSubmit={handleSubmit}
      className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
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
        className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      {message !== "" && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={code === "" || isChecking}
        className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isChecking ? "확인 중…" : "입장"}
      </button>
    </form>
  );
}
