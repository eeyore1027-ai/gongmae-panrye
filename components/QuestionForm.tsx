"use client";

// Design Ref: §3 화면 구성 — 쟁점 입력창과 분석하기 버튼
// Plan SC: 작업 6 판례 요약

import { useState } from "react";
import type { AnalyzeResponse } from "@/app/api/analyze/route";
import { MAX_QUESTION_CHARS, TRY_AGAIN_NOTICE } from "@/lib/rules";
import ResultView, { type ResultState } from "./ResultView";

export default function QuestionForm() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ResultState>({ kind: "idle" });

  const isEmpty = question.trim().length === 0;
  const isLoading = result.kind === "loading";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEmpty || isLoading) return;

    setResult({ kind: "loading" });
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await response.json()) as AnalyzeResponse;
      setResult({ kind: "done", data });
    } catch {
      setResult({
        kind: "done",
        data: { status: "error", message: TRY_AGAIN_NOTICE },
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="question" className="text-sm font-medium">
          궁금한 법률 쟁점
        </label>
        <textarea
          id="question"
          name="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={6}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="예: 압류재산 공매에서 매각결정 취소가 가능한 경우는?"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isEmpty || isLoading}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isLoading ? "분석 중…" : "분석하기"}
          </button>
        </div>
      </form>

      <ResultView state={result} />
    </div>
  );
}
