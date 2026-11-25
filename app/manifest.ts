import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "한글 모험",
    short_name: "한글 모험",
    description: "만 5세를 위한 6개월 한글 읽기 모험",
    lang: "ko",
    start_url: "/hangul",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fff8e7",
    theme_color: "#ffcf5c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "한글 모험", url: "/hangul" }],
  };
}
