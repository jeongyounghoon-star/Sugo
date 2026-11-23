import { notFound } from "next/navigation";
import { getStage, getWorld, playableStages } from "@/projects/hangul/data/curriculum";
import { PlayStage } from "@/projects/hangul/components/PlayStage";

export function generateStaticParams() {
  return playableStages().map((s) => ({ stageId: s.id }));
}

export default async function PlayPage({ params }: PageProps<"/hangul/play/[stageId]">) {
  const { stageId } = await params;
  const stage = getStage(stageId);
  if (!stage || !getWorld(stage.worldId)?.playable) notFound();
  return <PlayStage key={stage.id} stageId={stage.id} />;
}
