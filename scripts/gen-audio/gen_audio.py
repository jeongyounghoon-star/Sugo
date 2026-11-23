"""
한글 모험 음성 파일 생성기 (무료 Microsoft Edge 뉴럴 TTS, API 키 불필요).

    pip install -r scripts/gen-audio/requirements.txt
    npm run audio            # 목록 갱신 + 바뀐 것만 생성 (ffmpeg가 있으면 앞뒤 무음 자름)
    python scripts/gen-audio/gen_audio.py --force   # 전부 다시 생성

targets.json(앱 데이터에서 자동 생성)을 읽어 public/audio/hangul/<id>.mp3 를 만든다.
이미 만든 파일은 generated.json 에 (문장, 음성, 속도)를 기록해 두고, 바뀐 것만 다시 만든다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
from pathlib import Path

import edge_tts

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TARGETS = HERE / "targets.json"
LOCK = HERE / "generated.json"
CONCURRENCY = 4
RETRIES = 3
# 앞뒤 무음을 잘라서 글자 소리가 바로바로 나오게 한다 (ffmpeg가 있을 때만)
TRIM_FILTER = (
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,"
    "areverse,"
    "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,"
    "areverse"
)


def trim_silence(path: Path) -> None:
    tmp = path.with_suffix(".tmp.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-af", TRIM_FILTER,
         "-codec:a", "libmp3lame", "-b:a", "48k", "-ac", "1", str(tmp)],
        check=True,
    )
    tmp.replace(path)


async def synth(text: str, voice: str, rate: str, out: Path) -> None:
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(str(out))
            if out.stat().st_size == 0:
                raise RuntimeError("빈 파일")
            return
        except Exception as e:  # 네트워크 오류 등 → 재시도
            last = e
            await asyncio.sleep(1 + attempt)
    raise RuntimeError(f"{out.name}: {last}")


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="전부 다시 생성")
    parser.add_argument("--prune", action="store_true", help="목록에 없는 mp3 삭제")
    args = parser.parse_args()

    config = json.loads(TARGETS.read_text(encoding="utf-8"))
    voice: str = config["voice"]
    out_dir = ROOT / config["outDir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    trim = shutil.which("ffmpeg") is not None
    if not trim:
        print("ffmpeg가 없어 무음 자르기를 건너뜁니다 (선택 사항)")
    lock: dict = {} if args.force or not LOCK.exists() else json.loads(LOCK.read_text(encoding="utf-8"))

    todo = []
    for t in config["targets"]:
        spec = {"text": t["text"], "voice": voice, "rate": t["rate"], "trim": trim}
        out = out_dir / f"{t['id']}.mp3"
        if lock.get(t["id"]) == spec and out.exists():
            continue
        todo.append((t["id"], spec, out))

    print(f"생성할 파일 {len(todo)}개 / 전체 {len(config['targets'])}개 (voice={voice})")
    sem = asyncio.Semaphore(CONCURRENCY)

    async def run(item_id: str, spec: dict, out: Path) -> None:
        async with sem:
            await synth(spec["text"], spec["voice"], spec["rate"], out)
            if spec["trim"]:
                await asyncio.to_thread(trim_silence, out)
            lock[item_id] = spec
            print(f"  ✓ {item_id}: {spec['text']}")

    await asyncio.gather(*(run(*item) for item in todo))

    ids = {t["id"] for t in config["targets"]}
    lock = {k: v for k, v in sorted(lock.items()) if k in ids}
    LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.prune:
        for f in out_dir.glob("*.mp3"):
            if f.stem not in ids:
                f.unlink()
                print(f"  - 삭제 {f.name}")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(asyncio.run(main()))
