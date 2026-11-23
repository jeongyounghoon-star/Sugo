import Link from "next/link";
import { ProjectCard } from "@/components/ProjectCard";
import { PROJECTS } from "@/projects/registry";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-12 sm:py-16">
      <header className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ffcf5c] text-4xl shadow-md" aria-hidden>
          ✨
        </span>
        <div className="flex-1">
          <h1 className="text-5xl text-slate-800">Sugo</h1>
          <p className="font-sans text-slate-600">우리 가족이 만드는 작은 앱 모음</p>
        </div>
        <Link
          href="/parent"
          className="rounded-2xl bg-white px-4 py-3 font-sans text-slate-600 shadow-md transition hover:shadow-lg"
        >
          ⚙️ 부모 설정
        </Link>
      </header>

      <section aria-label="프로젝트" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map((p) => (
          <ProjectCard key={p.slug} project={p} />
        ))}
        <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border-4 border-dashed border-slate-300 p-6 text-center text-slate-400">
          <span className="text-6xl" aria-hidden>
            ＋
          </span>
          <p className="font-sans">다음 프로젝트가 여기에 생겨요</p>
        </div>
      </section>
    </main>
  );
}
