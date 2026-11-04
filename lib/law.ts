// Design Ref: §2.2 lib/law.ts — 법제처 Open API 호출 (이번 작업은 판례 검색·본문 조회만)
// Plan SC: 작업 4 법제처 판례 검색 연결
//
// 주의: 이 파일은 서버 코드(app/api, 서버 컴포넌트)에서만 불러온다.
// 인증키(LAW_OC)는 서버에서만 읽고, 오류 메시지나 로그에 넣지 않는다.
//
// 상태: 법제처 공식 안내 문서(판례 목록·본문 조회)를 보고 작성했지만,
// 인증키가 없어 실제 호출로는 아직 확인하지 못했다. 응답 형식은 키가 생기면 확인한다.

const BASE_URL = "https://www.law.go.kr/DRF";
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_DISPLAY = 10;
const MAX_CONTENT_CHARS = 6000; // 판례 본문이 너무 길 때 AI에 넘기기 전에 자르는 기준(가정값)

// ---------- 오류 ----------

export type LawApiErrorKind =
  | "config" // 인증키가 설정되지 않음
  | "timeout" // 시간 안에 응답이 없음
  | "network" // 연결 실패
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

function formatDate(raw: string): string {
  return /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
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

function toSummary(item: Json): PrecedentSummary {
  const courtCode = text(item["법원종류코드"]);
  return {
    id: text(item["판례일련번호"] ?? item["판례정보일련번호"]),
    caseName: text(item["사건명"]),
    caseNumber: text(item["사건번호"]),
    judgmentDate: formatDate(text(item["선고일자"])),
    court: text(item["법원명"]),
    isSupremeCourt: courtCode === "400201" || text(item["법원명"]) === "대법원",
    judgmentType: text(item["판결유형"]),
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

export function parseDetailResponse(root: unknown): PrecedentDetail {
  const node = unwrap(root);
  const rawContent = stripHtml(text(node["판례내용"]));
  const truncated = rawContent.length > MAX_CONTENT_CHARS;
  return {
    ...toSummary(node),
    issue: stripHtml(text(node["판시사항"])),
    summary: stripHtml(text(node["판결요지"])),
    referencedStatutes: stripHtml(text(node["참조조문"])),
    referencedCases: stripHtml(text(node["참조판례"])),
    content: truncated ? rawContent.slice(0, MAX_CONTENT_CHARS) : rawContent,
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

// 판례 검색 (본문 검색). 최신 선고일 순으로 돌려준다.
export async function searchPrecedents(
  query: string,
  options: { display?: number } = {},
): Promise<PrecedentSearchResult> {
  const trimmed = query.trim();
  if (trimmed === "") return { totalCount: 0, items: [] };

  const root = await callLawApi("lawSearch.do", {
    target: "prec",
    search: "2", // 2 = 본문검색
    query: trimmed,
    display: String(options.display ?? DEFAULT_DISPLAY),
    sort: "ddes", // 선고일자 내림차순
  });
  return parseSearchResponse(root);
}

// 판례 본문 조회
export async function getPrecedent(id: string): Promise<PrecedentDetail> {
  const root = await callLawApi("lawService.do", { target: "prec", ID: id });
  return parseDetailResponse(root);
}
