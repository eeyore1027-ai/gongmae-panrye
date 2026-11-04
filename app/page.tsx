// Design Ref: §3 화면 구성 — 헤더, 안내 배너, 입력, 결과 영역을 한 페이지에 배치
// Plan SC: 작업 3 화면 뼈대 (접속 코드 화면은 작업 10에서 추가)

import QuestionForm from "@/components/QuestionForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-100 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <h1 className="text-lg font-semibold">공매 판례분석 도우미</h1>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            참고용 서비스
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        <div
          role="note"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium">입력 전에 확인해 주세요</p>
          <p>
            사건 전체가 아니라 쟁점 위주로, 이름·주민번호·주소 없이 입력하세요.
            입력 내용은 저장되지 않지만, 답변을 만들기 위해 외부 AI 서비스로
            전송됩니다.
          </p>
        </div>

        <QuestionForm />
      </main>
    </div>
  );
}
