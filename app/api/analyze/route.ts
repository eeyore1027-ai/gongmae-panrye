// Design Ref: §4.2 분석 흐름 — 쟁점 → 검색어 → 판례 검색 → 요약 → 출력
// Plan SC: 작업 6 판례 요약 (범위 판단, 해석, 대체 설명, 접속 확인은 이후 작업에서 추가)
//
// 주의: 입력 글은 로그에 남기지 않는다. 오류 기록에는 오류 종류만 남긴다.

import { z } from "zod";
import { AiError, extractSearchKeywords, summarizePrecedents } from "@/lib/ai";
import {
  checkOverruled,
  findRelevantPrecedents,
  LawApiError,
  type OverruledBy,
} from "@/lib/law";
import {
  MAX_QUESTION_CHARS,
  MAX_SUMMARY_LINES,
  NOT_FOUND_NOTICE,
  TRY_AGAIN_NOTICE,
} from "@/lib/rules";

export const maxDuration = 60;

const RequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export type AnalyzedCase = {
  caseNumber: string;
  caseName: string;
  court: string;
  judgmentDate: string;
  summary: string;
  overruledBy: OverruledBy | null; // 이 판례를 변경한다고 이름을 적은 전원합의체 판결
  mayConflict: boolean; // AI 판단: 자료 안의 최신 판결과 다른 취지일 수 있음
  overrulingCheckFailed: boolean;
};

export type AnalyzeResponse =
  | { status: "ok"; keywords: string[]; cases: AnalyzedCase[] }
  | { status: "no-cases"; keywords: string[]; message: string }
  | { status: "error"; message: string };

function reply(body: AnalyzeResponse, status = 200) {
  return Response.json(body, { status });
}

function limitLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_SUMMARY_LINES)
    .join("\n");
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return reply(
      {
        status: "error",
        message: `쟁점을 ${MAX_QUESTION_CHARS}자 이내로 입력해 주세요.`,
      },
      400,
    );
  }
  const { question } = parsed.data;

  try {
    const keywords = await extractSearchKeywords(question);
    const precedents = await findRelevantPrecedents(keywords);
    if (precedents.length === 0) {
      return reply({ status: "no-cases", keywords, message: NOT_FOUND_NOTICE });
    }

    const [summaries, overrulingChecks] = await Promise.all([
      summarizePrecedents(question, precedents),
      Promise.all(precedents.map((item) => checkOverruled(item))),
    ]);

    // 사건번호·선고일·법원은 AI 답변이 아니라 법제처 자료의 값을 쓴다.
    const cases: AnalyzedCase[] = [];
    for (const [index, item] of precedents.entries()) {
      const check = overrulingChecks[index];
      const found = summaries.find(
        (summary) => summary.caseNumber.trim() === item.caseNumber,
      );
      if (!found?.relevant || found.summary.trim() === "") continue;
      cases.push({
        caseNumber: item.caseNumber,
        caseName: item.caseName,
        court: item.court,
        judgmentDate: item.judgmentDate,
        summary: limitLines(found.summary),
        overruledBy: check.status === "overruled" ? check.by : null,
        mayConflict: found.conflictsWithNewer,
        overrulingCheckFailed: check.status === "failed",
      });
    }

    // 변경된 판례는 맨 뒤로, 다른 취지일 수 있는 판례는 그 앞으로 보낸다.
    const caution = (item: AnalyzedCase) =>
      item.overruledBy ? 2 : item.mayConflict ? 1 : 0;
    cases.sort((a, b) => caution(a) - caution(b));

    if (cases.length === 0) {
      return reply({ status: "no-cases", keywords, message: NOT_FOUND_NOTICE });
    }
    return reply({ status: "ok", keywords, cases });
  } catch (error) {
    const kind =
      error instanceof AiError || error instanceof LawApiError
        ? error.kind
        : "unknown";
    console.error(`[analyze] 분석 실패: ${kind}`);
    return reply({ status: "error", message: TRY_AGAIN_NOTICE }, 502);
  }
}
