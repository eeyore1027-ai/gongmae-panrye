// Design Ref: §2.2 lib/ai.ts — OpenAI 호출을 한 곳에 모은다
// Plan SC: 작업 5 AI 호출 연결
//
// 주의: 이 파일은 서버 코드에서만 불러온다. API 키는 브라우저로 보내지 않는다.
// 입력 글에는 개인정보가 섞일 수 있으므로 로그나 오류 메시지에 넣지 않는다.

import OpenAI from "openai";
import { z } from "zod";
import type { PrecedentDetail } from "@/lib/law";
import {
  KEYWORD_INSTRUCTIONS,
  MAX_KEYWORDS,
  SUMMARY_INSTRUCTIONS,
} from "@/lib/rules";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;

export type AiErrorKind =
  | "config" // API 키나 모델 이름이 설정되지 않음
  | "timeout" // 시간 안에 응답이 없음
  | "auth" // API 키가 맞지 않음
  | "rate-limit" // 호출 한도 또는 사용 한도 초과
  | "bad-model" // 모델 이름이 없거나 쓸 수 없음
  | "empty" // 답변이 비어 있음
  | "bad-output" // 답변이 약속한 모양이 아님
  | "api"; // 그 밖의 호출 실패

export class AiError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
  }
}

// SDK 오류를 앱에서 쓰는 오류로 바꾼다. 원래 메시지는 넘기지 않는다.
function toAiError(error: unknown): AiError {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiError("timeout", "AI 서비스 응답이 지연되고 있습니다.");
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return new AiError("auth", "AI 서비스 API 키를 확인하세요.");
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AiError("rate-limit", "AI 서비스 사용 한도를 초과했습니다.");
  }
  if (error instanceof OpenAI.NotFoundError) {
    return new AiError("bad-model", "AI 모델 이름(OPENAI_MODEL)을 확인하세요.");
  }
  return new AiError("api", "AI 서비스 호출에 실패했습니다.");
}

export type AskAiOptions = {
  instructions: string; // AI가 지킬 규칙
  input: string; // 쟁점과 판례 자료
  maxOutputTokens?: number;
  jsonFormat?: { name: string; schema: Record<string, unknown> }; // 답변 모양을 강제할 때
};

export async function askAi(options: AskAiOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey) throw new AiError("config", "OPENAI_API_KEY가 설정되지 않았습니다.");
  if (!model) throw new AiError("config", "OPENAI_MODEL이 설정되지 않았습니다.");

  const client = new OpenAI({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  let text: string;
  try {
    const response = await client.responses.create({
      model,
      instructions: options.instructions,
      input: options.input,
      max_output_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      store: false, // PRD 7번: 입력 내용을 저장하지 않는다
      ...(options.jsonFormat && {
        text: {
          format: {
            type: "json_schema" as const,
            name: options.jsonFormat.name,
            schema: options.jsonFormat.schema,
            strict: true,
          },
        },
      }),
    });
    text = response.output_text;
  } catch (error) {
    throw toAiError(error);
  }

  if (text.trim() === "") {
    throw new AiError("empty", "AI 서비스가 빈 답변을 보냈습니다.");
  }
  return text;
}

// 답변을 약속한 모양(JSON)으로 받아 검사한다.
async function askAiJson<T extends z.ZodType>(
  name: string,
  schema: T,
  options: AskAiOptions,
): Promise<z.infer<T>> {
  const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  delete jsonSchema.$schema; // OpenAI에 보낼 때는 필요 없는 항목
  const text = await askAi({ ...options, jsonFormat: { name, schema: jsonSchema } });
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new AiError("bad-output", "AI 답변이 약속한 형식이 아닙니다.");
  }
}

const KeywordsSchema = z.object({ keywords: z.array(z.string()) });

// 쟁점 글에서 법제처로 보낼 검색어를 뽑는다.
// AI가 실수해도 숫자가 든 말(주민번호 등)은 한 번 더 걸러 보내지 않는다.
export async function extractSearchKeywords(question: string): Promise<string[]> {
  const { keywords } = await askAiJson("search_keywords", KeywordsSchema, {
    instructions: KEYWORD_INSTRUCTIONS,
    input: question,
    maxOutputTokens: 1000,
  });
  // 띄어쓴 말은 나눈다. 판례 본문에서 낱말 그대로 찾기 때문이다.
  const cleaned = keywords
    .flatMap((word) => word.trim().split(/\s+/))
    .filter((word) => word.length >= 2 && !/\d/.test(word));
  return [...new Set(cleaned)].slice(0, MAX_KEYWORDS);
}

const SummariesSchema = z.object({
  cases: z.array(
    z.object({
      caseNumber: z.string(),
      relevant: z.boolean(),
      summary: z.string(),
      conflictsWithNewer: z.boolean(),
    }),
  ),
});

export type CaseSummary = z.infer<typeof SummariesSchema>["cases"][number];

// 가져온 판례만 AI에게 주고 요약을 받는다.
export async function summarizePrecedents(
  question: string,
  precedents: PrecedentDetail[],
): Promise<CaseSummary[]> {
  const material = precedents
    .map((item) =>
      [
        `[사건번호] ${item.caseNumber}`,
        `[사건명] ${item.caseName}`,
        `[법원] ${item.court}`,
        `[선고일] ${item.judgmentDate}`,
        `[판결유형] ${item.judgmentType}`,
        `[판시사항] ${item.issue}`,
        `[판결요지] ${item.summary}`,
        `[본문] ${item.content}`,
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  const { cases } = await askAiJson("case_summaries", SummariesSchema, {
    instructions: SUMMARY_INSTRUCTIONS,
    input: `<쟁점>\n${question}\n</쟁점>\n\n<판례자료>\n${material}\n</판례자료>`,
  });
  return cases;
}
