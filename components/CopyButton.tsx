"use client";

// Design Ref: §3 화면 구성 — [ 결과 복사 ] 버튼
// Plan SC: 작업 13 결과 복사

import { useEffect, useRef, useState } from "react";
import { COPY_DONE_LABEL, COPY_FAILED_NOTICE, COPY_LABEL } from "@/lib/rules";

type CopyState = "idle" | "done" | "failed";

// 보안 연결이 아닌 주소에서도 동작하도록, 안 될 때는 임시 입력칸으로 복사하는 방법을 쓴다.
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(area);
    }
  }
}

export default function CopyButton({ getText }: { getText: () => string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function handleClick() {
    const copied = await writeToClipboard(getText());
    setState(copied ? "done" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className="flex flex-none items-center gap-2">
      {state === "failed" && (
        <span role="alert" className="text-xs text-error-text">
          {COPY_FAILED_NOTICE}
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        className="rounded border border-line bg-raised px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-glow"
      >
        {state === "done" ? COPY_DONE_LABEL : COPY_LABEL}
      </button>
    </div>
  );
}
