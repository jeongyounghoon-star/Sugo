/**
 * 앱 데이터에서 TTS 생성 대상 목록을 뽑아 targets.json 으로 저장한다.
 * 실행: npm run audio:targets
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAudioTargets } from "../../projects/hangul/audio/targets";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "targets.json");
const targets = buildAudioTargets();
const json = {
  voice: "ko-KR-SunHiNeural",
  outDir: "public/audio/hangul",
  targets,
};
writeFileSync(out, JSON.stringify(json, null, 2) + "\n", "utf8");
console.log(`targets.json: ${targets.length}개`);
