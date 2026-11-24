import { notFound } from "next/navigation";
import { WORLDS, getWorld } from "@/projects/hangul/data/curriculum";
import { WorldView } from "@/projects/hangul/components/WorldView";

export function generateStaticParams() {
  return WORLDS.map((w) => ({ worldId: String(w.id) }));
}

export default async function WorldPage({ params }: PageProps<"/hangul/world/[worldId]">) {
  const { worldId } = await params;
  const world = getWorld(Number(worldId));
  if (!world) notFound();
  return <WorldView worldId={world.id} />;
}
