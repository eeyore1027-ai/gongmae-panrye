// Design Ref: §3 화면 구성 — 결과 영역 (판례 요약 카드)
// Plan SC: 작업 6 판례 요약, 작업 8 사건 적용 해석, 작업 9 판례 없을 때 대체 설명

import type { AnalyzeResponse } from "@/app/api/analyze/route";
import type {
  AnalyzedCase,
  Interpretation,
  StatuteExplanation,
} from "@/app/api/analyze/route";
import {
  AUCTION_LABEL,
  AUCTION_NOTICE,
  CHECK_FAILED_LABEL,
  MAY_CONFLICT_LABEL,
  NEEDS_REVIEW_LABEL,
  OVERRULED_EXCLUDED_NOTICE,
  OVERRULED_LABEL,
  OVERRULING_NOTICE,
  REFERENCE_NOTICE,
  STATUTE_ANALOGY_LABEL,
  STATUTE_ANALOGY_NOTICE,
  STATUTE_GENERAL_NOTICE,
  SUMMARY_TRIMMED_NOTICE,
} from "@/lib/rules";

export type ResultState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: AnalyzeResponse };

const mutedText = "text-sm leading-6 text-muted";
const warnBox =
  "mb-3 rounded border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-text";

function Keywords({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null;
  return (
    <p className="mb-3 text-xs text-muted">
      법제처로 보낸 검색어: {keywords.join(", ")}
    </p>
  );
}

// 판례 변경 관련 경고. 변경된 판례는 근거로 쓰지 않도록 가장 눈에 띄게 표시한다.
function CaseWarning({ item }: { item: AnalyzedCase }) {
  if (item.overruledBy) {
    return (
      <p className="mb-3 rounded border border-danger-line bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
        {OVERRULED_LABEL}: {item.overruledBy.caseNumber} 전원합의체 판결(
        {item.overruledBy.judgmentDate})이 이 판결과 배치되는 범위에서
        변경했습니다. 어느 부분이 변경됐는지 확인하기 전에는 근거로 쓰지 마세요.
      </p>
    );
  }
  if (item.mayConflict) {
    return (
      <p className={warnBox}>
        {MAY_CONFLICT_LABEL} · {NEEDS_REVIEW_LABEL}
      </p>
    );
  }
  if (item.overrulingCheckFailed) {
    return (
      <p className={warnBox}>
        {CHECK_FAILED_LABEL} · {NEEDS_REVIEW_LABEL}
      </p>
    );
  }
  return null;
}

function AuctionBadge() {
  return (
    <span className="rounded bg-info-bg px-1.5 py-0.5 text-xs font-medium text-info-text">
      {AUCTION_LABEL}
    </span>
  );
}

function InterpretationView({
  interpretation,
  hasOverruled,
}: {
  interpretation: Interpretation;
  hasOverruled: boolean;
}) {
  const usesAuction =
    interpretation.status === "ok" &&
    interpretation.points.some((point) =>
      point.citations.some((citation) => citation.auctionAnalogy),
    );

  return (
    <div className="mt-8 rounded-lg border border-glow/40 bg-raised p-4">
      <h3 className="mb-3 text-base font-semibold text-light">사건 적용 해석</h3>
      {interpretation.status === "unavailable" ? (
        <p className={mutedText}>{interpretation.message}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {interpretation.points.map((point) => (
            <li
              key={point.text}
              className="rounded-lg border border-line bg-black/30 p-4"
            >
              <p className="text-[15px] leading-7">{point.text}</p>
              {point.needsReview && (
                <p className="mt-2 text-sm font-medium text-warn-text">
                  {NEEDS_REVIEW_LABEL}
                </p>
              )}
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                {point.citations.map((citation) => (
                  <li
                    key={citation.caseNumber}
                    className="flex items-center gap-1"
                  >
                    근거: {citation.caseNumber} ({citation.judgmentDate})
                    {citation.auctionAnalogy && <AuctionBadge />}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {usesAuction && <p className="mt-3 text-xs text-muted">{AUCTION_NOTICE}</p>}
      {hasOverruled && (
        <p className="mt-3 text-xs text-muted">{OVERRULED_EXCLUDED_NOTICE}</p>
      )}
    </div>
  );
}

function StatuteView({ statute }: { statute: StatuteExplanation }) {
  if (statute.status === "unavailable") {
    return <p className={`mt-3 ${mutedText}`}>{statute.message}</p>;
  }
  const usesAnalogy = statute.points.some((point) =>
    point.citations.some((citation) => citation.isAnalogy),
  );
  return (
    <div className="mt-4 rounded-lg border border-glow/40 bg-raised p-4">
      <h3 className="mb-3 text-base font-semibold text-light">법령 조문 기반 설명</h3>
      <ul className="flex flex-col gap-3">
        {statute.points.map((point) => (
          <li key={point.text} className="rounded-lg border border-line bg-black/30 p-4">
            <p className="text-[15px] leading-7">{point.text}</p>
            {point.needsReview && (
              <p className="mt-2 text-sm font-medium text-warn-text">
                {NEEDS_REVIEW_LABEL}
              </p>
            )}
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {point.citations.map((citation) => (
                <li
                  key={`${citation.lawName}${citation.articleNumber}`}
                  className="flex items-center gap-1"
                >
                  근거: {citation.lawName} {citation.articleNumber}
                  {citation.title && `(${citation.title})`}
                  {citation.isAnalogy && (
                    <span className="rounded bg-info-bg px-1.5 py-0.5 font-medium text-info-text">
                      {STATUTE_ANALOGY_LABEL}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{STATUTE_GENERAL_NOTICE}</p>
      {usesAnalogy && (
        <p className="mt-1 text-xs text-muted">{STATUTE_ANALOGY_NOTICE}</p>
      )}
    </div>
  );
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
    return (
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="loading-beam" />
        <p className={mutedText}>판례를 찾아 읽고 있습니다…</p>
      </div>
    );
  }

  const { data } = state;
  if (data.status === "error" || data.status === "unauthorized") {
    return <p className="text-sm text-error-text">{data.message}</p>;
  }
  if (data.status === "no-cases") {
    return (
      <>
        <Keywords keywords={data.keywords} />
        <p className={mutedText}>{data.message}</p>
        <StatuteView statute={data.statute} />
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
            className="rounded-lg border border-line bg-raised p-4"
          >
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-light">
              {item.caseNumber}
              {item.auctionAnalogy && <AuctionBadge />}
            </p>
            <p className="mb-3 text-sm text-muted">
              {[item.court, item.judgmentDate, item.caseName]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <CaseWarning item={item} />
            <p className="whitespace-pre-line text-[15px] leading-7">{item.summary}</p>
            {item.summaryTrimmed && (
              <p className="mt-2 text-xs text-muted">{SUMMARY_TRIMMED_NOTICE}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{OVERRULING_NOTICE}</p>
      <InterpretationView
        interpretation={data.interpretation}
        hasOverruled={data.cases.some((item) => item.overruledBy)}
      />
    </>
  );
}

export default function ResultView({ state }: { state: ResultState }) {
  return (
    <section
      aria-live="polite"
      className="min-h-40 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="mb-3 text-base font-semibold text-light">분석 결과</h2>
      <ResultBody state={state} />
      <p className="mt-4 border-t border-line pt-3 text-sm text-foreground">
        {REFERENCE_NOTICE}
      </p>
    </section>
  );
}
