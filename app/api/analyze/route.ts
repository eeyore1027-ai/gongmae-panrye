// Design Ref: §4.2 분석 흐름 — 쟁점 → 검색어 → 판례 검색 → 요약 → 출력
// Plan SC: 작업 6 판례 요약, 작업 8 사건 적용 해석, 작업 9 판례 없을 때 대체 설명, 작업 11 범위 판단
//
// 주의: 입력 글은 로그에 남기지 않는다. 오류 기록에는 오류 종류만 남긴다.

import { z } from "zod";
import {
  AiError,
  explainFromStatutes,
  interpretCase,
  reviewQuestion,
  summarizePrecedents,
} from "@/lib/ai";
import { hasValidSession } from "@/lib/auth";
import {
  checkOverruled,
  findRelevantArticles,
  findRelevantPrecedents,
  isAuctionOnlyPrecedent,
  LawApiError,
  type OverruledBy,
  type PrecedentDetail,
} from "@/lib/law";
import {
  CHECK_FAILED_LABEL,
  INTERPRETATION_FAILED_NOTICE,
  MAX_CITED_CASES,
  MAX_INTERPRETATION_POINTS,
  MAX_QUESTION_CHARS,
  MAX_SUMMARY_LINES,
  MAY_CONFLICT_LABEL,
  NO_INTERPRETATION_BASIS_NOTICE,
  NO_STATUTE_NOTICE,
  NOT_FOUND_NOTICE,
  OUT_OF_SCOPE_NOTICE,
  SESSION_EXPIRED_NOTICE,
  STATUTE_FAILED_NOTICE,
  TRY_AGAIN_NOTICE,
} from "@/lib/rules";
import {
  collectKnownFacts,
  verifyPoints,
  verifyStatutePoints,
  verifySummaryLines,
  type VerifiedPoint,
  type VerifiedStatutePoint,
} from "@/lib/verify";

export const maxDuration = 90;

const RequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export type AnalyzedCase = {
  caseNumber: string;
  caseName: string;
  court: string;
  judgmentDate: string;
  summary: string;
  summaryTrimmed: boolean; // 원문에서 확인되지 않는 문장을 뺐는지
  overruledBy: OverruledBy | null; // 이 판례를 변경한다고 이름을 적은 전원합의체 판결
  mayConflict: boolean; // AI 판단: 자료 안의 최신 판결과 다른 취지일 수 있음
  overrulingCheckFailed: boolean;
  auctionAnalogy: boolean; // AI 판단: 공매에 준용하는 경매 판례
};

export type StatuteExplanation =
  | { status: "ok"; points: VerifiedStatutePoint[] }
  | { status: "unavailable"; message: string };

export type Interpretation =
  | { status: "ok"; points: VerifiedPoint[] }
  | { status: "unavailable"; message: string };

export type AnalyzeResponse =
  | {
      status: "ok";
      keywords: string[];
      cases: AnalyzedCase[];
      interpretation: Interpretation;
    }
  | {
      status: "no-cases";
      keywords: string[];
      message: string;
      statute: StatuteExplanation;
    }
  | { status: "out-of-scope"; message: string }
  | { status: "unauthorized"; message: string }
  | { status: "error"; message: string };

function reply(body: AnalyzeResponse, status = 200) {
  return Response.json(body, { status });
}

function sourceTexts(item: PrecedentDetail): string[] {
  return [
    item.caseNumber,
    item.judgmentDate,
    item.issue,
    item.summary,
    item.referencedCases,
    item.content,
  ];
}

// 판례 없음: 법령 조문을 근거로 일반 설명을 만든다. 실패해도 지어낸 설명은 보내지 않는다.
async function buildStatuteExplanation(
  question: string,
  keywords: string[],
): Promise<StatuteExplanation> {
  try {
    const articles = await findRelevantArticles(keywords);
    if (articles.length === 0) {
      return { status: "unavailable", message: NO_STATUTE_NOTICE };
    }
    const points = verifyStatutePoints(
      await explainFromStatutes(question, articles),
      articles,
      MAX_INTERPRETATION_POINTS,
    );
    if (points.length === 0) {
      return { status: "unavailable", message: NO_STATUTE_NOTICE };
    }
    return { status: "ok", points };
  } catch (error) {
    const kind =
      error instanceof AiError || error instanceof LawApiError
        ? error.kind
        : "unknown";
    console.error(`[analyze] 법령 설명 실패: ${kind}`);
    return { status: "unavailable", message: STATUTE_FAILED_NOTICE };
  }
}

async function replyNoCases(question: string, keywords: string[]) {
  const statute = await buildStatuteExplanation(question, keywords);
  return reply({ status: "no-cases", keywords, message: NOT_FOUND_NOTICE, statute });
}

// 변경된 판례는 빼고 해석을 만든다. 해석만 실패하면 요약은 그대로 보여 준다.
async function buildInterpretation(
  question: string,
  cases: AnalyzedCase[],
  precedents: PrecedentDetail[],
): Promise<Interpretation> {
  const usable = cases
    .filter((item) => !item.overruledBy)
    .slice(0, MAX_CITED_CASES);
  if (usable.length === 0) {
    return { status: "unavailable", message: NO_INTERPRETATION_BASIS_NOTICE };
  }

  try {
    const points = await interpretCase(
      question,
      usable.flatMap((item) => {
        const precedent = precedents.find(
          (candidate) => candidate.caseNumber === item.caseNumber,
        );
        if (!precedent) return [];
        return [
          {
            precedent,
            isAuctionCase: item.auctionAnalogy,
            cautions: [
              ...(item.mayConflict ? [MAY_CONFLICT_LABEL] : []),
              ...(item.overrulingCheckFailed ? [CHECK_FAILED_LABEL] : []),
            ],
          },
        ];
      }),
    );
    const verified = verifyPoints(
      points,
      usable.map((item) => ({
        caseNumber: item.caseNumber,
        judgmentDate: item.judgmentDate,
        auctionAnalogy: item.auctionAnalogy,
        needsCaution: item.mayConflict || item.overrulingCheckFailed,
      })),
      MAX_INTERPRETATION_POINTS,
      collectKnownFacts(precedents.flatMap(sourceTexts)).dates,
    );
    if (verified.length === 0) {
      return { status: "unavailable", message: INTERPRETATION_FAILED_NOTICE };
    }
    return { status: "ok", points: verified };
  } catch (error) {
    const kind = error instanceof AiError ? error.kind : "unknown";
    console.error(`[analyze] 해석 실패: ${kind}`);
    return { status: "unavailable", message: INTERPRETATION_FAILED_NOTICE };
  }
}

export async function POST(request: Request) {
  // 접속하지 않은 요청은 법제처·AI를 부르기 전에 막는다. (AI 비용 보호)
  if (!(await hasValidSession())) {
    return reply({ status: "unauthorized", message: SESSION_EXPIRED_NOTICE }, 401);
  }

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
    // 범위 밖 질문은 법제처와 판례 요약을 부르기 전에 끝낸다.
    const { inScope, keywords } = await reviewQuestion(question);
    if (!inScope) {
      return reply({ status: "out-of-scope", message: OUT_OF_SCOPE_NOTICE });
    }

    const precedents = await findRelevantPrecedents(keywords);
    if (precedents.length === 0) return await replyNoCases(question, keywords);

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
      const checked = verifySummaryLines(found.summary, sourceTexts(item));
      if (checked.lines.length === 0) continue;
      cases.push({
        caseNumber: item.caseNumber,
        caseName: item.caseName,
        court: item.court,
        judgmentDate: item.judgmentDate,
        summary: checked.lines.slice(0, MAX_SUMMARY_LINES).join("\n"),
        summaryTrimmed: checked.removed > 0,
        overruledBy: check.status === "overruled" ? check.by : null,
        mayConflict: found.conflictsWithNewer,
        overrulingCheckFailed: check.status === "failed",
        auctionAnalogy: found.isAuctionCase || isAuctionOnlyPrecedent(item),
      });
    }

    // 변경된 판례는 맨 뒤로, 다른 취지일 수 있는 판례는 그 앞으로 보낸다.
    const caution = (item: AnalyzedCase) =>
      item.overruledBy ? 2 : item.mayConflict ? 1 : 0;
    cases.sort((a, b) => caution(a) - caution(b));

    if (cases.length === 0) return await replyNoCases(question, keywords);
    const interpretation = await buildInterpretation(question, cases, precedents);
    return reply({ status: "ok", keywords, cases, interpretation });
  } catch (error) {
    const kind =
      error instanceof AiError || error instanceof LawApiError
        ? error.kind
        : "unknown";
    console.error(`[analyze] 분석 실패: ${kind}`);
    return reply({ status: "error", message: TRY_AGAIN_NOTICE }, 502);
  }
}
