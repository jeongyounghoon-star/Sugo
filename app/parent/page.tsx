import type { Metadata } from "next";
import { ParentPanel } from "@/components/ParentPanel";

export const metadata: Metadata = { title: "부모 설정", robots: { index: false } };

export default function ParentPage() {
  return <ParentPanel />;
}
