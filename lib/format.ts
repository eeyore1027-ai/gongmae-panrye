// Design Ref: §3 화면 구성 — [ 결과 복사 ] 버튼이 복사할 글을 만든다
// Plan SC: 작업 13 결과 복사 (PRD 5번 nice)
//
// 화면에 보이는 결과를 공문서·메신저에 붙여 넣기 좋은 일반 글로 바꾼다.
// 근거(사건번호·선고일·조문)와 "확인 필요"·참고용 문구는 복사본에도 반드시 함께 넣는다.
// 순수 함수라 서버·브라우저 어디서든 쓸 수 있고, 비밀 값은 다루지 않는다.

import type { AnalyzeResponse } from "../app/api/analyze/route";
import {
  APP_NAME,
  AUCTION_LABEL,
  CHECK_FAILED_LABEL,
  MAY_CONFLICT_LABEL,
  NEEDS_REVIEW_LABEL,
  OVERRULED_LABEL,
  OVERRULING_NOTICE,
  REFERENCE_NOTICE,
  STATUTE_ANALOGY_LABEL,
  STATUTE_GENERAL_NOTICE,
} from "./rules";

// 복사할 결과가 있는 응답만 true. (안내문·오류뿐인 응답에는 복사 버튼을 보여 주지 않는다)
export function hasCopyableResult(data: AnalyzeResponse): boolean {
  return data.status === "ok" || (data.status === "no-cases" && data.statute.status === "ok");
}

// 번호 붙은 항목의 둘째 줄부터는 들여써서 읽기 쉽게 한다.
function indent(text: string, spaces = 3): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${pad}${line}`))
    .join("\n");
}

export function formatResultForCopy(question: string, data: AnalyzeResponse): string {
  if (!hasCopyableResult(data)) return "";

  const lines: string[] = [`[${APP_NAME}]`, "", `질문: ${question.trim()}`];

  if (data.status === "ok") {
    lines.push("", "■ 판례 요약");
    for (const item of data.cases) {
      const flags = [
        item.overruledBy
          ? `${OVERRULED_LABEL}: ${item.overruledBy.caseNumber} 전원합의체 판결(${item.overruledBy.judgmentDate})이 변경함`
          : "",
        item.mayConflict ? MAY_CONFLICT_LABEL : "",
        item.overrulingCheckFailed ? CHECK_FAILED_LABEL : "",
        item.auctionAnalogy ? AUCTION_LABEL : "",
      ].filter(Boolean);
      const header = [item.court, item.judgmentDate, item.caseName].filter(Boolean).join(" · ");
      lines.push("", `◆ ${item.caseNumber} (${header})`);
      if (item.lawUrl) lines.push(`  원문: ${item.lawUrl}`);
      if (flags.length > 0) lines.push(`  ※ ${flags.join(" / ")}`);
      for (const line of item.summary.split("\n")) lines.push(`  - ${line}`);
    }
    lines.push("", OVERRULING_NOTICE);

    lines.push("", "■ 사건 적용 해석");
    if (data.interpretation.status === "ok") {
      data.interpretation.points.forEach((point, index) => {
        const sources = point.citations
          .map((c) => `${c.caseNumber}(${c.judgmentDate})${c.auctionAnalogy ? ` ${AUCTION_LABEL}` : ""}`)
          .join(", ");
        const body = `${point.text}${point.needsReview ? ` [${NEEDS_REVIEW_LABEL}]` : ""}\n근거: ${sources}`;
        lines.push("", `${index + 1}. ${indent(body)}`);
      });
    } else {
      lines.push("", data.interpretation.message);
    }
  } else if (data.status === "no-cases" && data.statute.status === "ok") {
    lines.push("", data.message, "", "■ 법령 조문 기반 설명");
    data.statute.points.forEach((point, index) => {
      const sources = point.citations
        .map(
          (c) =>
            `${c.lawName} ${c.articleNumber}${c.title ? `(${c.title})` : ""}${c.isAnalogy ? ` ${STATUTE_ANALOGY_LABEL}` : ""}`,
        )
        .join(", ");
      const body = `${point.text}${point.needsReview ? ` [${NEEDS_REVIEW_LABEL}]` : ""}\n근거: ${sources}`;
      lines.push("", `${index + 1}. ${indent(body)}`);
    });
    lines.push("", STATUTE_GENERAL_NOTICE);
  }

  lines.push("", `※ ${REFERENCE_NOTICE}`);
  return lines.join("\n");
}
