"use client";

// Design Ref: §3 화면 구성 — 쟁점 입력창과 분석하기 버튼 (이번 작업에서는 뼈대만 만든다)
// Plan SC: 작업 3 화면 뼈대

import { useState } from "react";
import ResultView, { type ResultStatus } from "./ResultView";

export default function QuestionForm() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<ResultStatus>("idle");

  const isEmpty = question.trim().length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEmpty) return;
    // 아직 판례 검색·AI 연결 전이므로 안내 상태만 보여 준다.
    setStatus("waiting-for-feature");
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
          placeholder="예: 압류재산 공매에서 매각결정 취소가 가능한 경우는?"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-6 text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isEmpty}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            분석하기
          </button>
        </div>
      </form>

      <ResultView status={status} />
    </div>
  );
}
