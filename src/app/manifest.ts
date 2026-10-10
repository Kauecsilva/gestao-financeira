import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão Financeira",
    short_name: "Finanças",
    description: "Sua situação financeira, compromissos e planejamento em um lugar.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#2a78d6",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
