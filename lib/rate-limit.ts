// Design Ref: §6 보안·개인정보 — 접속 시도와 분석 호출 횟수를 제한한다
// Plan SC: 공개 전 보안 점검 SEC-001·SEC-002
//
// 한계(중요): 서버 한 대(인스턴스)의 메모리에서만 센다. Vercel은 요청이 몰리면 서버를 여러 대 띄우고
// 서버가 쉴 때 메모리가 사라지므로, 이 제한은 "한 사람이 빠르게 반복하는 것"을 늦추는 보조 장치일 뿐이다.
// 확실한 방어는 Vercel 방화벽의 호출 수 제한과 OpenAI 월 사용 한도다.
// 접속자 주소(IP)는 횟수를 세는 데만 쓰고 로그나 응답에 남기지 않는다.

const hits = new Map<string, number[]>(); // "구분:주소" → 최근 시각 목록
const MAX_KEYS = 5000; // 메모리가 끝없이 늘지 않게 하는 상한

// 플랫폼이 채워 주는 접속자 주소를 쓴다. 없으면 한 묶음으로 센다.
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function recent(name: string, key: string, windowMs: number, now: number): number[] {
  const id = `${name}:${key}`;
  const list = (hits.get(id) ?? []).filter((time) => now - time < windowMs);
  if (list.length > 0) hits.set(id, list);
  else hits.delete(id);
  return list;
}

// 최근 windowMs 안에 쌓인 횟수가 max 이상이면 true (기록은 하지 않는다)
export function isLimited(
  name: string,
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  return recent(name, key, windowMs, now).length >= max;
}

export function recordHit(
  name: string,
  key: string,
  windowMs: number,
  now: number = Date.now(),
): void {
  const list = recent(name, key, windowMs, now);
  list.push(now);
  hits.set(`${name}:${key}`, list);

  if (hits.size > MAX_KEYS) {
    // 오래된 것부터 지워 상한을 지킨다. (Map은 넣은 순서를 기억한다)
    for (const id of hits.keys()) {
      hits.delete(id);
      if (hits.size <= MAX_KEYS / 2) break;
    }
  }
}
