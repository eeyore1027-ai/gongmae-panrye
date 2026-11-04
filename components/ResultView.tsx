// Design Ref: §3 화면 구성 — 결과가 나올 영역 (이번 작업에서는 뼈대만 만든다)
// Plan SC: 작업 3 화면 뼈대

// 결과 영역의 상태. 이후 작업에서 판례 결과, 법령 설명, 범위 밖 안내, 오류 상태가 추가된다.
export type ResultStatus = "idle" | "waiting-for-feature";

type ResultViewProps = {
  status: ResultStatus;
};

export default function ResultView({ status }: ResultViewProps) {
  return (
    <section
      aria-live="polite"
      className="min-h-40 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="mb-2 text-base font-semibold">분석 결과</h2>

      {status === "idle" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          쟁점을 입력하고 &quot;분석하기&quot;를 누르면 판례 요약과 사건 적용
          해석이 여기에 나타납니다.
        </p>
      )}

      {status === "waiting-for-feature" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          아직 분석 기능이 연결되지 않았습니다. 다음 작업에서 판례 검색과 요약을
          연결하면 결과가 이곳에 표시됩니다.
        </p>
      )}

      <p className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500">
        참고용이며 최종 판단은 담당자가 한다.
      </p>
    </section>
  );
}
