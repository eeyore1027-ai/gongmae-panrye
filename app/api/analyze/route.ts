// Design Ref: §4.2 분석 흐름 — 쟁점 → 검색어 → 판례 검색 → 요약 → 출력
// Plan SC: 작업 6 판례 요약, 작업 8 사건 적용 해석 (범위 판단, 대체 설명은 이후 작업에서 추가)
//
// 주의: 입력 글은 로그에 남기지 않는다. 오류 기록에는 오류 종류만 남긴다.

import { z } from "zod";
import {
  AiError,
  extractSearchKeywords,
  interpretCase,
  summarizePrecedents,
} from "@/lib/ai";
import { hasValidSession } from "@/lib/auth";
import {
  checkOverruled,
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
  NOT_FOUND_NOTICE,
  SESSION_EXPIRED_NOTICE,
  TRY_AGAIN_NOTICE,
} from "@/lib/rules";
import { verifyPoints, type VerifiedPoint } from "@/lib/verify";

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
  overruledBy: OverruledBy | null; // 이 판례를 변경한다고 이름을 적은 전원합의체 판결
  mayConflict: boolean; // AI 판단: 자료 안의 최신 판결과 다른 취지일 수 있음
  overrulingCheckFailed: boolean;
  auctionAnalogy: boolean; // AI 판단: 공매에 준용하는 경매 판례
};

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
  | { status: "no-cases"; keywords: string[]; message: string }
  | { status: "unauthorized"; message: string }
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
        auctionAnalogy: found.isAuctionCase || isAuctionOnlyPrecedent(item),
      });
    }

    // 변경된 판례는 맨 뒤로, 다른 취지일 수 있는 판례는 그 앞으로 보낸다.
    const caution = (item: AnalyzedCase) =>
      item.overruledBy ? 2 : item.mayConflict ? 1 : 0;
    cases.sort((a, b) => caution(a) - caution(b));

    if (cases.length === 0) {
      return reply({ status: "no-cases", keywords, message: NOT_FOUND_NOTICE });
    }
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
