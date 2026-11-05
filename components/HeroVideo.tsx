"use client";

// 접속 코드 화면의 배경 영상.
// 카메라가 계속 다가가는 영상이라 반복하면 장면이 튄다. 한 번만 재생하고 마지막 장면에 멈춘다.

import { useEffect, useRef } from "react";

export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.muted = true;
    // 브라우저가 자동 재생을 막아도 첫 장면과 어두운 배경은 그대로 보인다.
    video.play().catch(() => {});
  }, []);

  return (
    <video
      ref={videoRef}
      src="/videos/hero.mp4"
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
