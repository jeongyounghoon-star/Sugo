import Link from "next/link";
import { projectHref, type ProjectInfo } from "@/projects/registry";

export function ProjectCard({ project }: { project: ProjectInfo }) {
  const live = project.status === "live";
  const body = (
    <>
      <div
        className="flex h-40 items-center justify-center text-8xl"
        style={{ backgroundColor: project.color }}
        aria-hidden
      >
        <span className="drop-shadow-md transition group-hover:scale-110 group-active:scale-95">
          {project.emoji}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h2 className="text-3xl text-slate-800">{project.title}</h2>
        <p className="font-sans text-base leading-relaxed text-slate-600">{project.description}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {project.tags.map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-3 py-1 font-sans text-sm text-slate-600">
              {t}
            </span>
          ))}
          {!live && (
            <span className="rounded-full bg-amber-100 px-3 py-1 font-sans text-sm text-amber-700">준비 중</span>
          )}
        </div>
      </div>
    </>
  );
  const className =
    "group flex min-h-80 flex-col overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-2xl";
  return live ? (
    <Link href={projectHref(project)} className={className}>
      {body}
    </Link>
  ) : (
    <div className={`${className} opacity-60`}>{body}</div>
  );
}
