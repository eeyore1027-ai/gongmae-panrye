// Design Ref: §3 화면 구성 — 접속 전에는 코드 입력, 접속 후에는 입력·결과 화면
// Plan SC: 작업 10 접속 코드

import { connection } from "next/server";
import { Suspense } from "react";
import AccessGate from "@/components/AccessGate";
import BrandLogo from "@/components/BrandLogo";
import QuestionForm from "@/components/QuestionForm";
import { hasValidSession } from "@/lib/auth";

// 쿠키를 읽어 접속 여부에 따라 화면을 고른다.
async function PageContent() {
  await connection(); // 요청마다 접속 만료 시각을 새로 확인한다.
  if (!(await hasValidSession())) return <AccessGate />;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="brand-band px-4 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <h1>
            <BrandLogo />
          </h1>
          <span className="flex-none rounded-full border border-white/25 bg-black/30 px-3 py-1 text-xs text-white">
            참고용 서비스
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        <div
          role="note"
          className="rounded-lg border border-warn-line bg-warn-bg p-4 text-sm leading-6 text-warn-text"
        >
          <p className="font-medium">입력 전에 확인해 주세요</p>
          <p>
            사건 전체가 아니라 쟁점 위주로, 이름·주민번호·주소 없이 입력하세요.
            입력 내용은 이 서비스에 저장되지 않습니다. 다만 답변을 만들기 위해
            외부 AI 서비스로 전송되며, 그쪽에 일정 기간 보관될 수 있습니다.
          </p>
        </div>

        <QuestionForm />
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-background p-6">
          <p className="text-sm text-muted">접속 상태를 확인하고 있습니다…</p>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
