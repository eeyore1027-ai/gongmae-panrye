// Design Ref: §4.1 접속 — 접속 코드를 확인하고 서명한 쿠키로 접속 상태를 유지한다
// Plan SC: 작업 10 접속 코드
//
// 주의: 서버 코드에서만 불러온다. 접속 코드와 서명용 값은 브라우저로 보내지 않는다.
// 설정값이 없으면 누구도 들어올 수 없게 막는다.

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_HOURS } from "@/lib/rules";

const COOKIE_NAME = "access_session";
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

function readSettings(): { accessCode: string; secret: string } | null {
  const accessCode = process.env.ACCESS_CODE;
  const secret = process.env.AUTH_SECRET;
  return accessCode && secret ? { accessCode, secret } : null;
}

export function isAuthConfigured(): boolean {
  return readSettings() !== null;
}

// 글자 수가 달라도 비교 시간이 같도록 해시한 뒤 비교한다.
function safeEqual(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export function isCorrectCode(code: string): boolean {
  const settings = readSettings();
  return settings !== null && safeEqual(code, settings.accessCode);
}

// 접속 코드를 서명에 함께 넣어, 코드를 바꾸면 기존 쿠키가 모두 무효가 되게 한다.
function sign(expiresAt: string, settings: { accessCode: string; secret: string }): string {
  return createHmac("sha256", settings.secret)
    .update(`${expiresAt}:${settings.accessCode}`)
    .digest("hex");
}

function isValidToken(token: string | undefined): boolean {
  const settings = readSettings();
  if (!settings || !token) return false;

  const [expiresAt, signature, extra] = token.split(".");
  if (!expiresAt || !signature || extra !== undefined) return false;
  if (!safeEqual(signature, sign(expiresAt, settings))) return false;

  const expires = Number(expiresAt);
  return Number.isFinite(expires) && expires > Date.now();
}

// 쿠키를 읽으므로 페이지에서는 <Suspense> 안에서 불러야 한다.
export async function hasValidSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidToken(cookieStore.get(COOKIE_NAME)?.value);
}

// Route Handler에서만 부른다.
export async function startSession(): Promise<void> {
  const settings = readSettings();
  if (!settings) return;

  const expiresAt = String(Date.now() + SESSION_MS);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${expiresAt}.${sign(expiresAt, settings)}`, {
    httpOnly: true, // 화면의 스크립트가 읽지 못하게 한다
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // 다른 사이트에서 보낸 요청에는 쿠키를 붙이지 않는다
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}
