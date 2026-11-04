// Design Ref: §3 화면 구성 — 접속 전에는 코드 입력, 접속 후에는 입력·결과 화면
// Plan SC: 작업 10 접속 코드

import { Suspense } from "react";
import AccessGate from "@/components/AccessGate";
import QuestionForm from "@/components/QuestionForm";
import { hasValidSession } from "@/lib/auth";

// 쿠키를 읽어 접속 여부에 따라 화면을 고른다.
async function PageContent() {
  if (!(await hasValidSession())) return <AccessGate />;

  return (
    <>
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
    </>
  );
}

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
        <Suspense
          fallback={<p className="text-sm text-zinc-500">접속 상태를 확인하고 있습니다…</p>}
        >
          <PageContent />
        </Suspense>
      </main>
    </div>
  );
}
