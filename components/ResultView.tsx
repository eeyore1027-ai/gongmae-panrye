// Design Ref: §3 화면 구성 — 결과 영역 (판례 요약 카드)
// Plan SC: 작업 6 판례 요약

import type { AnalyzeResponse } from "@/app/api/analyze/route";
import type { AnalyzedCase } from "@/app/api/analyze/route";
import {
  CHECK_FAILED_LABEL,
  MAY_CONFLICT_LABEL,
  NEEDS_REVIEW_LABEL,
  OVERRULED_LABEL,
  OVERRULING_NOTICE,
  REFERENCE_NOTICE,
} from "@/lib/rules";

export type ResultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: AnalyzeResponse };

const mutedText = "text-sm text-zinc-600 dark:text-zinc-400";

function Keywords({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null;
  return (
    <p className="mb-3 text-xs text-zinc-500">
      법제처로 보낸 검색어: {keywords.join(", ")}
    </p>
  );
}

// 판례 변경 관련 경고. 변경된 판례는 근거로 쓰지 않도록 가장 눈에 띄게 표시한다.
function CaseWarning({ item }: { item: AnalyzedCase }) {
  if (item.overruledBy) {
    return (
      <p className="mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        {OVERRULED_LABEL}: {item.overruledBy.caseNumber} 전원합의체 판결(
        {item.overruledBy.judgmentDate})이 이 판결과 배치되는 범위에서
        변경했습니다. 어느 부분이 변경됐는지 확인하기 전에는 근거로 쓰지 마세요.
      </p>
    );
  }
  if (item.mayConflict) {
    return (
      <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        {MAY_CONFLICT_LABEL} · {NEEDS_REVIEW_LABEL}
      </p>
    );
  }
  if (item.overrulingCheckFailed) {
    return (
      <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
        {CHECK_FAILED_LABEL} · {NEEDS_REVIEW_LABEL}
      </p>
    );
  }
  return null;
}

function ResultBody({ state }: { state: ResultState }) {
  if (state.kind === "idle") {
    return (
      <p className={mutedText}>
        쟁점을 입력하고 &quot;분석하기&quot;를 누르면 판례 요약이 여기에
        나타납니다.
      </p>
    );
  }
  if (state.kind === "loading") {
    return <p className={mutedText}>판례를 찾아 읽고 있습니다…</p>;
  }

  const { data } = state;
  if (data.status === "error") {
    return <p className="text-sm text-red-700 dark:text-red-400">{data.message}</p>;
  }
  if (data.status === "no-cases") {
    return (
      <>
        <Keywords keywords={data.keywords} />
        <p className={mutedText}>{data.message}</p>
      </>
    );
  }
  return (
    <>
      <Keywords keywords={data.keywords} />
      <ul className="flex flex-col gap-3">
        {data.cases.map((item) => (
          <li
            key={item.caseNumber}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <p className="text-sm font-semibold">{item.caseNumber}</p>
            <p className="mb-2 text-xs text-zinc-500">
              {[item.court, item.judgmentDate, item.caseName]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <CaseWarning item={item} />
            <p className="whitespace-pre-line text-sm leading-6">{item.summary}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-500">{OVERRULING_NOTICE}</p>
    </>
  );
}

export default function ResultView({ state }: { state: ResultState }) {
  return (
    <section
      aria-live="polite"
      className="min-h-40 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="mb-2 text-base font-semibold">분석 결과</h2>
      <ResultBody state={state} />
      <p className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
        {REFERENCE_NOTICE}
      </p>
    </section>
  );
}
