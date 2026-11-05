// Design Ref: §4.2 ⑥ 서버 검증 — AI 답변 속 사건번호·선고일·조문을 가져온 자료와 대조한다
// Plan SC: 작업 7 사건번호 실존 확인, 작업 8 사건 적용 해석, 작업 9 판례 없을 때 대체 설명

export type CitableCase = {
  caseNumber: string;
  judgmentDate: string;
  auctionAnalogy: boolean; // 경매 판례를 준용했는지
  needsCaution: boolean; // 다른 취지일 수 있거나 변경 여부를 확인하지 못함
};

export type RawPoint = {
  text: string;
  citedCaseNumbers: string[];
  needsReview: boolean;
};

export type VerifiedPoint = {
  text: string;
  citations: { caseNumber: string; judgmentDate: string; auctionAnalogy: boolean }[];
  needsReview: boolean;
};

export type CitableArticle = {
  lawName: string;
  articleNumber: string;
  title: string;
  text: string;
  isAnalogy: boolean;
};

export type RawStatutePoint = {
  text: string;
  citedArticles: { lawName: string; articleNumber: string }[];
  needsReview: boolean;
};

export type VerifiedStatutePoint = {
  text: string;
  citations: { lawName: string; articleNumber: string; title: string; isAnalogy: boolean }[];
  needsReview: boolean;
};

// 사건번호 모양: 숫자 + 사건 구분 글자 + 숫자 (예: 2007두18154)
const CASE_NUMBER_PATTERN =
  /\d{2,4}\s?(?:가단|가합|가소|구합|구단|고단|고합|고정|고약|카합|카단|드합|드단|즈합|즈단|헌가|헌바|헌마|헌라|헌사|재가합|재가단|재다|재두|재누|나|다|두|누|구|노|도|모|마|라|므|르|스|브|아|머|그|카|후|허|초|부|무|드|느|즈|로|보|오)\s?\d{1,7}/g;

// 날짜 모양: 2008-11-20, 2008. 11. 20., 2008년 11월 20일
const DATE_PATTERN = /(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/g;

function findCaseNumbers(text: string): string[] {
  return (text.match(CASE_NUMBER_PATTERN) ?? []).map((found) =>
    found.replace(/\s/g, ""),
  );
}

function findDates(text: string): string[] {
  return [...text.matchAll(DATE_PATTERN)].map(
    ([, year, month, day]) => `${year}-${Number(month)}-${Number(day)}`,
  );
}

// AI에게 자료를 읽는 방법을 알려 주려고 붙인 내부 표시. 사용자에게 보이는 글에 섞이면 안 된다.
const INTERNAL_MARKER = /\[(?:주의|경매 판례|준용 법령)\]|(?:주의|경매 판례|준용 법령)\s*표시/;

export type KnownFacts = { caseNumbers: Set<string>; dates: Set<string> };

// 가져온 자료 글에 실제로 나오는 사건번호와 날짜를 모은다.
export function collectKnownFacts(texts: string[]): KnownFacts {
  return {
    caseNumbers: new Set(texts.flatMap(findCaseNumbers)),
    dates: new Set(texts.flatMap(findDates)),
  };
}

function hasUnknownFact(text: string, facts: KnownFacts): boolean {
  return (
    INTERNAL_MARKER.test(text) ||
    findCaseNumbers(text).some((number) => !facts.caseNumbers.has(number)) ||
    findDates(text).some((date) => !facts.dates.has(date))
  );
}

// 요약 글: 원문에 없는 사건번호나 날짜가 든 문장을 뺀다.
export function verifySummaryLines(
  summary: string,
  sourceTexts: string[],
): { lines: string[]; removed: number } {
  const facts = collectKnownFacts(sourceTexts);
  const lines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const kept = lines.filter((line) => !hasUnknownFact(line, facts));
  return { lines: kept, removed: lines.length - kept.length };
}

// 자료에 없는 판례에 기대는 항목은 지운다. 근거가 하나도 없는 항목도 지운다.
// 주의가 필요한 판례를 근거로 쓴 항목은 AI 판단과 상관없이 확인 필요로 표시한다.
export function verifyPoints(
  points: RawPoint[],
  allowed: CitableCase[],
  maxPoints: number,
  knownDates: Set<string> = new Set(),
): VerifiedPoint[] {
  const byNumber = new Map(allowed.map((item) => [item.caseNumber, item]));
  const facts: KnownFacts = {
    caseNumbers: new Set(allowed.flatMap((item) => findCaseNumbers(item.caseNumber))),
    dates: new Set([...knownDates, ...allowed.flatMap((item) => findDates(item.judgmentDate))]),
  };

  const verified: VerifiedPoint[] = [];
  for (const point of points) {
    const text = point.text.trim();
    if (text === "" || hasUnknownFact(text, facts)) continue;

    const cited = [...new Set(point.citedCaseNumbers.map((n) => n.trim()))];
    if (cited.length === 0 || cited.some((number) => !byNumber.has(number))) continue;

    const cases = cited.map((number) => byNumber.get(number)!);
    verified.push({
      text,
      citations: cases.map(({ caseNumber, judgmentDate, auctionAnalogy }) => ({
        caseNumber,
        judgmentDate,
        auctionAnalogy,
      })),
      needsReview: point.needsReview || cases.some((item) => item.needsCaution),
    });
  }
  return verified.slice(0, maxPoints);
}

const ARTICLE_PATTERN = /제\s?(\d+)\s?조(?:\s?의\s?(\d+))?/g;

function findArticleNumbers(text: string): string[] {
  return [...text.matchAll(ARTICLE_PATTERN)].map(
    ([, number, branch]) => `제${number}조${branch ? `의${branch}` : ""}`,
  );
}

const articleKey = (lawName: string, articleNumber: string) =>
  `${lawName.trim()}|${articleNumber.trim()}`;

// 법령 설명: 가져온 조문을 근거로 든 항목만 남긴다. 판례는 주지 않았으므로 사건번호가 든 항목도 지운다.
export function verifyStatutePoints(
  points: RawStatutePoint[],
  articles: CitableArticle[],
  maxPoints: number,
): VerifiedStatutePoint[] {
  const byKey = new Map(
    articles.map((article) => [articleKey(article.lawName, article.articleNumber), article]),
  );
  const knownNumbers = new Set(articles.map((article) => article.articleNumber));
  const facts: KnownFacts = {
    caseNumbers: new Set(),
    dates: new Set(articles.flatMap((article) => findDates(article.text))),
  };

  const verified: VerifiedStatutePoint[] = [];
  for (const point of points) {
    const text = point.text.trim();
    if (text === "" || hasUnknownFact(text, facts)) continue;
    if (findArticleNumbers(text).some((number) => !knownNumbers.has(number))) continue;

    const cited = point.citedArticles.map((item) =>
      byKey.get(articleKey(item.lawName, item.articleNumber)),
    );
    if (cited.length === 0 || cited.some((article) => !article)) continue;

    const unique = [...new Set(cited as CitableArticle[])];
    verified.push({
      text,
      citations: unique.map(({ lawName, articleNumber, title, isAnalogy }) => ({
        lawName,
        articleNumber,
        title,
        isAnalogy,
      })),
      needsReview: point.needsReview,
    });
  }
  return verified.slice(0, maxPoints);
}
