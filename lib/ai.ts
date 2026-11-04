// Design Ref: §2.2 lib/ai.ts — OpenAI 호출을 한 곳에 모은다
// Plan SC: 작업 5 AI 호출 연결
//
// 주의: 이 파일은 서버 코드에서만 불러온다. API 키는 브라우저로 보내지 않는다.
// 입력 글에는 개인정보가 섞일 수 있으므로 로그나 오류 메시지에 넣지 않는다.

import OpenAI from "openai";

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
