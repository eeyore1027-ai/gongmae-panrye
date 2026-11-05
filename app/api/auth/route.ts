// Design Ref: §4.1 접속 — 접속 코드가 맞으면 쿠키를 발급한다
// Plan SC: 작업 10 접속 코드
//
// 주의: 입력한 코드는 로그에 남기지 않는다.

import { z } from "zod";
import { isAuthConfigured, isCorrectCode, startSession } from "@/lib/auth";
import { clientKey, isLimited, recordHit } from "@/lib/rate-limit";
import {
  ACCESS_DENIED_NOTICE,
  ACCESS_NOT_READY_NOTICE,
  AUTH_MAX_FAILURES,
  AUTH_WINDOW_MS,
  TOO_MANY_ATTEMPTS_NOTICE,
} from "@/lib/rules";

const RequestSchema = z.object({ code: z.string().min(1).max(200) });

const WRONG_CODE_DELAY_MS = 1000; // 틀린 코드에는 잠깐 뒤에 답해 대입 속도를 늦춘다

export type AuthResponse = { ok: true } | { ok: false; message: string };

function reply(body: AuthResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    console.error("[auth] ACCESS_CODE 또는 AUTH_SECRET이 설정되지 않음");
    return reply({ ok: false, message: ACCESS_NOT_READY_NOTICE }, 503);
  }

  // 틀린 시도가 너무 쌓인 접속자는 맞는 코드를 넣어도 잠시 막는다.
  const key = clientKey(request);
  if (isLimited("auth-fail", key, AUTH_MAX_FAILURES, AUTH_WINDOW_MS)) {
    console.warn("[auth] 시도 횟수 초과");
    return Response.json(
      { ok: false, message: TOO_MANY_ATTEMPTS_NOTICE } satisfies AuthResponse,
      { status: 429, headers: { "Retry-After": String(AUTH_WINDOW_MS / 1000) } },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isCorrectCode(parsed.data.code)) {
    recordHit("auth-fail", key, AUTH_WINDOW_MS);
    console.warn("[auth] 접속 코드 불일치");
    await new Promise((resolve) => setTimeout(resolve, WRONG_CODE_DELAY_MS));
    return reply({ ok: false, message: ACCESS_DENIED_NOTICE }, 401);
  }

  await startSession();
  return reply({ ok: true });
}
