// Design Ref: §4.2 ⑥ 서버 검증 — AI 답변 속 사건번호를 가져온 자료와 대조한다
// Plan SC: 작업 8 사건 적용 해석 (근거 판례 최대 5건, 확인 필요 표시)

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

// 사건번호 모양: 숫자 + 사건 구분 글자 + 숫자 (예: 2007두18154)
const CASE_NUMBER_PATTERN =
  /\d{2,4}\s?(?:가단|가합|가소|구합|구단|고단|고합|헌가|헌바|헌마|재다|재두|나|다|두|누|구|노|도|마|라|므|르|스|브|아|머|그|카)\s?\d{1,7}/g;

function findCaseNumbers(text: string): string[] {
  return (text.match(CASE_NUMBER_PATTERN) ?? []).map((found) =>
    found.replace(/\s/g, ""),
  );
}

// 자료에 없는 판례에 기대는 항목은 지운다. 근거가 하나도 없는 항목도 지운다.
// 주의가 필요한 판례를 근거로 쓴 항목은 AI 판단과 상관없이 확인 필요로 표시한다.
export function verifyPoints(
  points: RawPoint[],
  allowed: CitableCase[],
  maxPoints: number,
): VerifiedPoint[] {
  const byNumber = new Map(allowed.map((item) => [item.caseNumber, item]));
  const knownInText = new Set(
    allowed.flatMap((item) => findCaseNumbers(item.caseNumber)),
  );

  const verified: VerifiedPoint[] = [];
  for (const point of points) {
    const text = point.text.trim();
    if (text === "") continue;
    if (findCaseNumbers(text).some((number) => !knownInText.has(number))) continue;

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
