// Design Ref: §1.2 규칙 숫자와 고정 문구를 한 곳에 모은다. PRD가 바뀌면 이 파일만 고친다.
// Plan SC: 작업 5 AI 호출 연결 (PRD 5번 "AI가 지킬 규칙"의 공통 부분)

export const MAX_SUMMARY_LINES = 10;
export const MAX_CITED_CASES = 5;

export const REFERENCE_NOTICE = "참고용이며 최종 판단은 담당자가 한다.";
export const NEEDS_REVIEW_LABEL = "법무 담당자 확인 필요";
export const OUT_OF_SCOPE_NOTICE = "공매 업무 관련 질문만 답할 수 있다.";
export const TRY_AGAIN_NOTICE = "잠시 후 다시 시도해 주세요.";

// 모든 AI 호출에 공통으로 넣는 지시문
export const BASE_INSTRUCTIONS = `당신은 압류재산 공매(조세) 업무 담당 직원을 돕는 판례 분석 도우미입니다.
- 한국어로, 법률 용어를 쉬운 말로 풀어서 답합니다.
- 제공된 자료에 있는 내용만 근거로 삼습니다. 자료에 없는 판례, 사건번호, 법령을 지어내지 않습니다.
- 확실하지 않은 내용은 단정하지 않고 "${NEEDS_REVIEW_LABEL}"라고 표시합니다.
- 최종 법적 판단을 대신 내리지 않습니다.`;
