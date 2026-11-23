import type { Metadata, Viewport } from "next";
import { HangulShell } from "@/projects/hangul/components/HangulShell";

export const metadata: Metadata = {
  title: "한글 모험",
  description: "만 5세를 위한 6개월 한글 읽기 모험",
};

export const viewport: Viewport = {
  themeColor: "#bfe8ff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function HangulLayout({ children }: LayoutProps<"/hangul">) {
  return (
    <div className="kid-ui flex min-h-dvh flex-1 flex-col bg-gradient-to-b from-[#bfe8ff] via-[#e8f7ff] to-[#fff8e7]">
      <HangulShell>{children}</HangulShell>
    </div>
  );
}
