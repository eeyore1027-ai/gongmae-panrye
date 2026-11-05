// Design Ref: §4.1 접속 — 접속 코드가 맞으면 쿠키를 발급한다
// Plan SC: 작업 10 접속 코드
//
// 주의: 입력한 코드는 로그에 남기지 않는다.

import { z } from "zod";
import { isAuthConfigured, isCorrectCode, startSession } from "@/lib/auth";
import { ACCESS_DENIED_NOTICE, ACCESS_NOT_READY_NOTICE } from "@/lib/rules";

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

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isCorrectCode(parsed.data.code)) {
    console.warn("[auth] 접속 코드 불일치");
    await new Promise((resolve) => setTimeout(resolve, WRONG_CODE_DELAY_MS));
    return reply({ ok: false, message: ACCESS_DENIED_NOTICE }, 401);
  }

  await startSession();
  return reply({ ok: true });
}
