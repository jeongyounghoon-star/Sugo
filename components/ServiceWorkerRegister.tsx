"use client";

import { useEffect } from "react";

/** 홈 화면 설치(PWA) + 오프라인 재생을 위한 서비스 워커 등록 (배포 빌드에서만) */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // 등록 실패해도 앱은 그대로 동작
    });
  }, []);
  return null;
}
