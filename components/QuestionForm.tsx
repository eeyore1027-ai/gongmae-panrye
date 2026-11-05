"use client";

// Design Ref: §3 화면 구성, §4.3 추가 질문 — 대화는 이 화면에서만 기억하고 서버에 저장하지 않는다
// Plan SC: 작업 6 판례 요약, 작업 12 추가 질문, 작업 13 결과 복사

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AnalyzeResponse, HistoryTurn } from "@/app/api/analyze/route";
import {
  FOLLOW_UP_LIMIT_NOTICE,
  MAX_FOLLOW_UPS,
  MAX_HISTORY_ANSWER_CHARS,
  MAX_HISTORY_TURNS,
  MAX_QUESTION_CHARS,
  TRY_AGAIN_NOTICE,
} from "@/lib/rules";
import ResultView from "./ResultView";

type Turn = {
  id: number;
  question: string;
  data: AnalyzeResponse | null; // null이면 답을 기다리는 중
};

// 다음 질문의 맥락으로 보낼 답변 요지. 근거 없는 안내나 오류는 맥락에 넣지 않는다.
function summarizeAnswer(data: AnalyzeResponse | null): string | null {
  if (data?.status === "ok") {
    const points =
      data.interpretation.status === "ok"
        ? data.interpretation.points.map((point) => point.text)
        : data.cases.map((item) => item.summary);
    return points.join("\n");
  }
  if (data?.status === "no-cases" && data.statute.status === "ok") {
    return data.statute.points.map((point) => point.text).join("\n");
  }
  return null;
}

function buildHistory(turns: Turn[]): HistoryTurn[] {
  return turns
    .flatMap((turn) => {
      const answer = summarizeAnswer(turn.data);
      if (answer === null) return [];
      return [
        { question: turn.question, answer: answer.slice(0, MAX_HISTORY_ANSWER_CHARS) },
      ];
    })
    .slice(-MAX_HISTORY_TURNS);
}

export default function QuestionForm() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(0);
  const latestTurn = useRef<HTMLDivElement>(null);

  const isLoading = turns.some((turn) => turn.data === null);
  const followUpCount = Math.max(turns.length - 1, 0);
  const canFollowUp = turns.length > 0 && followUpCount < MAX_FOLLOW_UPS;

  // 질문을 보내면 그 결과가 시작되는 곳으로 화면을 옮긴다.
  useEffect(() => {
    if (turns.length > 1) latestTurn.current?.scrollIntoView({ block: "start" });
  }, [turns.length]);

  async function ask(text: string, previous: Turn[]) {
    const id = nextId.current++;
    setTurns([...previous, { id, question: text, data: null }]);

    let data: AnalyzeResponse;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: buildHistory(previous) }),
      });
      data = (await response.json()) as AnalyzeResponse;
    } catch {
      data = { status: "error", message: TRY_AGAIN_NOTICE };
    }
    setTurns((current) =>
      current.map((turn) => (turn.id === id ? { ...turn, data } : turn)),
    );
    // 접속이 만료되면 서버가 접속 코드 화면을 보여 주도록 새로 불러온다.
    if (data.status === "unauthorized") router.refresh();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim() === "" || isLoading) return;
    setFollowUp("");
    void ask(question.trim(), []); // 새 분석은 이전 대화를 잇지 않는다
  }

  function handleFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (followUp.trim() === "" || isLoading || !canFollowUp) return;
    const text = followUp.trim();
    setFollowUp("");
    void ask(text, turns);
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
          className="field resize-y"
        />
        <div className="flex items-center justify-end gap-3">
          {turns.length > 0 && (
            <p className="text-xs text-muted">
              다시 분석하면 아래 대화가 지워집니다.
            </p>
          )}
          <button
            type="submit"
            disabled={question.trim() === "" || isLoading}
            className="btn-primary flex-none"
          >
            {isLoading ? "분석 중…" : "분석하기"}
          </button>
        </div>
      </form>

      {turns.length === 0 ? (
        <ResultView state={{ kind: "idle" }} />
      ) : (
        turns.map((turn, index) => (
          <div
            key={turn.id}
            ref={index === turns.length - 1 ? latestTurn : undefined}
            className="scroll-mt-4"
          >
            <ResultView
              heading={index === 0 ? "분석 결과" : "추가 질문 결과"}
              question={index === 0 ? undefined : turn.question}
              copyQuestion={turn.question}
              state={
                turn.data === null
                  ? { kind: "loading" }
                  : { kind: "done", data: turn.data }
              }
            />
          </div>
        ))
      )}

      {turns.length > 0 &&
        (canFollowUp ? (
          <form onSubmit={handleFollowUp} className="flex flex-col gap-3">
            <label htmlFor="follow-up" className="text-sm font-medium">
              추가 질문
            </label>
            <textarea
              id="follow-up"
              name="follow-up"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              rows={3}
              maxLength={MAX_QUESTION_CHARS}
              placeholder="예: 체납자가 공매 사실을 알고 있었다면 결론이 달라지나요?"
              className="field resize-y"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                대화는 이 화면에서만 기억하며, 화면을 닫으면 사라집니다.
              </p>
              <button
                type="submit"
                disabled={followUp.trim() === "" || isLoading}
                className="btn-primary flex-none"
              >
                {isLoading ? "분석 중…" : "질문하기"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted">{FOLLOW_UP_LIMIT_NOTICE}</p>
        ))}
    </div>
  );
}
