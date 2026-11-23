// public/icons/icon.svg → PWA용 PNG 아이콘 생성. 실행: npm run icons
import { readFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("public/icons/icon.svg");
const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  // maskable: 안전 영역(80%) 안에 들어가도록 여백
  ["icon-maskable-512.png", 512, 52],
];
for (const [name, size, pad] of out) {
  const inner = size - pad * 2;
  const img = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffcf5c" } })
    .composite([{ input: img, left: pad, top: pad }])
    .png()
    .toFile(`public/icons/${name}`);
  console.log(name);
}
