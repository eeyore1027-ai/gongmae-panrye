// Design Ref: §2.2 lib/law.ts — 법제처 Open API 호출 (이번 작업은 판례 검색·본문 조회만)
// Plan SC: 작업 4 법제처 판례 검색 연결
//
// 주의: 이 파일은 서버 코드(app/api, 서버 컴포넌트)에서만 불러온다.
// 인증키(LAW_OC)는 서버에서만 읽고, 오류 메시지나 로그에 넣지 않는다.
//
// 상태: 법제처 공식 안내 문서(판례 목록·본문 조회)를 보고 작성하고,
// 실제 호출(2026-11-04)로 응답 구조(PrecSearch / PrecService, 필드 이름)를 확인했다.
// 확인된 점: 국세법령정보시스템 출처 판례는 본문을 JSON으로 받을 수 없어서,
// 기본으로 법원(대법원 데이터 출처) 판례만 검색한다. (PRD: 법원에서 공개한 판례만 사용)

const BASE_URL = "https://www.law.go.kr/DRF";
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_DISPLAY = 10;
const SUPREME_COURT_CODE = "400201";
const DEFAULT_SOURCE = "대법원"; // 법원 공개 판례의 데이터출처명
const MAX_CONTENT_CHARS = 6000; // 판례 본문이 너무 길 때 AI에 넘기기 전에 자르는 기준(가정값)

// ---------- 오류 ----------

export type LawApiErrorKind =
  | "config" // 인증키가 설정되지 않음
  | "timeout" // 시간 안에 응답이 없음
  | "network" // 연결 실패
  | "not-found" // 해당 판례를 찾을 수 없거나 본문을 JSON으로 받을 수 없음
  | "bad-response"; // 응답이 약속한 형식이 아님 (인증 실패 안내 페이지 등)

export class LawApiError extends Error {
  kind: LawApiErrorKind;
  constructor(kind: LawApiErrorKind, message: string) {
    super(message);
    this.name = "LawApiError";
    this.kind = kind;
  }
}

// ---------- 결과 모양 ----------

export type PrecedentSummary = {
  id: string; // 판례일련번호
  caseName: string; // 사건명
  caseNumber: string; // 사건번호
  judgmentDate: string; // 선고일자 (YYYY-MM-DD, 알 수 없으면 원문)
  court: string; // 법원명
  isSupremeCourt: boolean; // 대법원 여부 (법원종류코드 400201)
  judgmentType: string; // 판결유형
  source: string; // 데이터출처명 (예: 대법원, 국세법령정보시스템)
};

export type PrecedentSearchResult = {
  totalCount: number;
  items: PrecedentSummary[];
};

export type PrecedentDetail = PrecedentSummary & {
  issue: string; // 판시사항
  summary: string; // 판결요지
  referencedStatutes: string; // 참조조문
  referencedCases: string; // 참조판례
  content: string; // 판례내용 (태그 제거, 길면 잘림)
  contentTruncated: boolean;
};

// ---------- 값 다듬기 도우미 ----------

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("\n");
  return "";
}

// 응답이 {"PrecSearch": {...}} 처럼 한 겹으로 감싸져 있어도 안쪽 객체를 꺼낸다.
function unwrap(root: unknown): Json {
  if (!isObject(root)) {
    throw new LawApiError("bad-response", "법제처 응답이 예상한 형식이 아닙니다.");
  }
  const keys = Object.keys(root);
  if (keys.length === 1 && isObject(root[keys[0]])) {
    return root[keys[0]] as Json;
  }
  return root;
}

// 선고일자는 "20210315"(본문 조회)나 "2021.03.15"(검색 목록)로 온다. 둘 다 "2021-03-15"로 맞춘다.
function formatDate(raw: string): string {
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(raw)) return raw.replace(/\./g, "-");
  return raw;
}

// 본문에 섞여 있는 HTML 태그를 지우고 줄바꿈만 남긴다.
function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// 판결의 결론은 대개 끝에 있으므로, 길면 앞부분과 끝부분을 함께 남긴다.
function clipContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const half = Math.floor(maxChars / 2);
  return `${content.slice(0, half)}
…(중략)…
${content.slice(-half)}`;
}

function toSummary(item: Json): PrecedentSummary {
  const courtCode = text(item["법원종류코드"]);
  return {
    id: text(item["판례일련번호"] ?? item["판례정보일련번호"]),
    caseName: text(item["사건명"]),
    caseNumber: text(item["사건번호"]),
    judgmentDate: formatDate(text(item["선고일자"])),
    court: text(item["법원명"]),
    isSupremeCourt: courtCode === SUPREME_COURT_CODE || text(item["법원명"]) === "대법원",
    judgmentType: text(item["판결유형"]),
    source: text(item["데이터출처명"]),
  };
}

// ---------- 응답 해석 (순수 함수: 키 없이도 시험할 수 있다) ----------

export function parseSearchResponse(root: unknown): PrecedentSearchResult {
  const node = unwrap(root);
  const items = asArray(node["prec"])
    .filter(isObject)
    .map(toSummary)
    .filter((item) => item.id !== "" && item.caseNumber !== "");
  const total = Number(text(node["totalCnt"]));
  return { totalCount: Number.isFinite(total) ? total : items.length, items };
}

export function parseDetailResponse(
  root: unknown,
  maxContentChars: number = MAX_CONTENT_CHARS,
): PrecedentDetail {
  // 찾을 수 없을 때는 {"Law": "일치하는 판례가 없습니다..."} 처럼 안내 문장만 온다.
  if (isObject(root) && typeof root["Law"] === "string") {
    throw new LawApiError("not-found", "해당 판례를 찾을 수 없습니다.");
  }
  const node = unwrap(root);
  if (text(node["사건번호"]) === "") {
    throw new LawApiError("not-found", "판례 본문에 사건번호가 없습니다.");
  }
  const rawContent = stripHtml(text(node["판례내용"]));
  const truncated = rawContent.length > maxContentChars;
  return {
    ...toSummary(node),
    issue: stripHtml(text(node["판시사항"])),
    summary: stripHtml(text(node["판결요지"])),
    referencedStatutes: stripHtml(text(node["참조조문"])),
    referencedCases: stripHtml(text(node["참조판례"])),
    content: clipContent(rawContent, maxContentChars),
    contentTruncated: truncated,
  };
}

// ---------- 호출 ----------

async function callLawApi(
  endpoint: "lawSearch.do" | "lawService.do",
  params: Record<string, string>,
): Promise<unknown> {
  const oc = process.env.LAW_OC;
  if (!oc) {
    throw new LawApiError("config", "법제처 인증키(LAW_OC)가 설정되지 않았습니다.");
  }

  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("type", "JSON");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    // 주소에 인증키가 들어 있으므로 원래 오류 메시지는 넘기지 않는다.
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LawApiError("timeout", "법제처 응답이 지연되고 있습니다.");
    }
    throw new LawApiError("network", "법제처에 연결하지 못했습니다.");
  }

  if (!response.ok) {
    throw new LawApiError("bad-response", `법제처 응답 오류 (${response.status})`);
  }

  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    // 인증 실패나 서버 점검 안내가 JSON이 아닌 페이지로 오는 경우
    throw new LawApiError(
      "bad-response",
      "법제처가 JSON이 아닌 응답을 보냈습니다. 인증키나 호출 서버 등록을 확인하세요.",
    );
  }
}

// 판례 검색. 기본은 본문 검색이고, 최신 선고일 순으로 돌려준다.
export async function searchPrecedents(
  query: string,
  options: {
    display?: number;
    sourceName?: string;
    searchIn?: "title" | "body";
    supremeCourtOnly?: boolean;
  } = {},
): Promise<PrecedentSearchResult> {
  const trimmed = query.trim();
  if (trimmed === "") return { totalCount: 0, items: [] };

  const root = await callLawApi("lawSearch.do", {
    target: "prec",
    search: options.searchIn === "title" ? "1" : "2", // 1 = 판례명, 2 = 본문
    query: trimmed,
    display: String(options.display ?? DEFAULT_DISPLAY),
    sort: "ddes", // 선고일자 내림차순
    datSrcNm: options.sourceName ?? DEFAULT_SOURCE, // 법원 판례만 (본문을 JSON으로 받을 수 있음)
    ...(options.supremeCourtOnly ? { org: SUPREME_COURT_CODE } : {}),
  });
  return parseSearchResponse(root);
}

// 판례 본문 조회
export async function getPrecedent(
  id: string,
  maxContentChars: number = MAX_CONTENT_CHARS,
): Promise<PrecedentDetail> {
  const root = await callLawApi("lawService.do", { target: "prec", ID: id });
  return parseDetailResponse(root, maxContentChars);
}

// ---------- 관련 판례 찾기 ----------
//
// 실제 호출로 확인한 점 (2026-11-04)
// - 본문 검색에 낱말을 그냥 넣으면 낱말이 흩어져 있어도 잡혀서 무관한 판례가 많다.
//   낱말을 큰따옴표로 묶으면 크게 줄어든다.
// - 판례명 검색은 결과가 적지만 관련도가 높다.
// - 같은 사건번호가 다른 일련번호로 두 번 오기도 한다.
// - 관련도순 정렬이 없어서, 후보의 본문을 받아 직접 점수를 매긴다.

const CANDIDATE_TARGET = 15; // 후보가 이만큼 모이면 검색 조건을 그만 넓힌다
const SEARCH_DISPLAY = 30;
const MAX_BODY_FETCH = 12; // 본문까지 받아 점수를 매길 후보 수
const MIN_BODY_MENTIONS = 5; // 제목·요지에 없을 때 본문에 나와야 하는 최소 횟수
const DEFAULT_RESULT_LIMIT = 5; // PRD: 근거 판례 최대 5건

function isEnBanc(item: PrecedentSummary): boolean {
  return item.judgmentType.includes("전원합의체");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

export type RankedPrecedent = PrecedentDetail & {
  score: number;
  matchedKeywords: string[];
};

// 본문 전체를 보고 점수를 매긴다. 관련이 약하면 null을 돌려준다.
export function scorePrecedent(
  detail: PrecedentDetail,
  keywords: string[],
): Omit<RankedPrecedent, keyof PrecedentDetail> | null {
  const headline = [detail.caseName, detail.issue, detail.summary].join("\n");
  let score = 0;
  let headlineHit = false;
  let bodyMentions = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of keywords) {
    const inTitle = detail.caseName.includes(keyword);
    const inHeadline = countOccurrences(headline, keyword);
    const inBody = countOccurrences(detail.content, keyword);
    if (inHeadline + inBody === 0) continue;
    matchedKeywords.push(keyword);
    headlineHit = headlineHit || inHeadline > 0;
    bodyMentions += inBody;
    score += 10 + (inTitle ? 15 : 0) + Math.min(inHeadline, 5) * 3 + Math.min(inBody, 20) * 0.5;
  }

  const enoughKeywords = matchedKeywords.length >= Math.ceil(keywords.length / 2);
  if (!enoughKeywords || (!headlineHit && bodyMentions < MIN_BODY_MENTIONS)) return null;
  if (detail.isSupremeCourt) score += 5;
  if (isEnBanc(detail)) score += 30;
  // 공매 업무용 앱이므로 공매를 직접 다룬 판례를 앞에 둔다. 경매 판례는 빼지 않는다(준용 대상).
  if (headline.includes("공매")) score += 15;
  else if (detail.content.includes("공매")) score += 5;
  return { score, matchedKeywords };
}

// 판례명 검색과 따옴표 본문 검색을 합치고, 모자라면 뒤쪽 검색어를 빼며 넓힌다.
async function collectCandidates(keywords: string[]): Promise<PrecedentSummary[]> {
  // 같은 사건번호는 처음 것만 남긴다.
  const byCaseNumber = new Map<string, PrecedentSummary>();
  const add = (items: PrecedentSummary[]) => {
    for (const item of items) {
      if (!byCaseNumber.has(item.caseNumber)) byCaseNumber.set(item.caseNumber, item);
    }
  };

  // 판례명에 검색어가 하나라도 있는 판례를 모은다.
  const byTitle = await Promise.all(
    keywords.map((word) =>
      searchPrecedents(word, { searchIn: "title", display: SEARCH_DISPLAY }),
    ),
  );
  add(byTitle.flatMap((result) => result.items));

  // 최신 하급심에 밀리지 않도록 대법원 판례를 따로 모은다.
  const bySupremeCourt = await searchPrecedents(
    keywords.map((word) => `"${word}"`).join(" "),
    { searchIn: "body", display: SEARCH_DISPLAY, supremeCourtOnly: true },
  );
  add(bySupremeCourt.items);

  // 본문에 검색어가 모두 있는 판례를 모으고, 모자라면 뒤쪽 검색어를 빼며 넓힌다.
  let bodyFound = 0;
  for (let count = keywords.length; count >= 1 && bodyFound < CANDIDATE_TARGET; count--) {
    const quoted = keywords.slice(0, count).map((word) => `"${word}"`).join(" ");
    const byBody = await searchPrecedents(quoted, { searchIn: "body", display: SEARCH_DISPLAY });
    add(byBody.items);
    bodyFound = byBody.items.length;
  }

  // 판례명에 검색어가 많이 든 후보를 앞에 둔다. (본문까지 받는 후보 수에 제한이 있다)
  const titleHits = (item: PrecedentSummary) =>
    keywords.filter((word) => item.caseName.includes(word)).length;
  // 전원합의체 판결은 기존 판례를 바꾸는 경우가 있으므로 가장 먼저 본다.
  const rank = (item: PrecedentSummary) =>
    (isEnBanc(item) ? 100 : 0) + titleHits(item) * 10 + (item.isSupremeCourt ? 1 : 0);
  return [...byCaseNumber.values()].sort((a, b) => rank(b) - rank(a));
}

// 쟁점과 관련이 높은 판례를 점수순으로 돌려준다.
export async function findRelevantPrecedents(
  keywords: string[],
  options: { limit?: number } = {},
): Promise<RankedPrecedent[]> {
  if (keywords.length === 0) return [];

  const candidates = (await collectCandidates(keywords)).slice(0, MAX_BODY_FETCH);
  const details = await Promise.allSettled(
    candidates.map((candidate) => getPrecedent(candidate.id, Number.POSITIVE_INFINITY)),
  );

  const ranked: RankedPrecedent[] = [];
  for (const result of details) {
    if (result.status !== "fulfilled") continue; // 본문을 못 받은 판례는 근거로 쓰지 않는다
    const scored = scorePrecedent(result.value, keywords);
    if (!scored) continue;
    const full = result.value;
    const truncated = full.content.length > MAX_CONTENT_CHARS;
    ranked.push({
      ...full,
      ...scored,
      content: clipContent(full.content, MAX_CONTENT_CHARS),
      contentTruncated: truncated,
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score || b.judgmentDate.localeCompare(a.judgmentDate))
    .slice(0, options.limit ?? DEFAULT_RESULT_LIMIT);
}
