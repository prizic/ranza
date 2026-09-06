import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f4efe6",
    description: "Ranza Student App and Operator Dashboard",
    dir: "ltr",
    display: "standalone",
    icons: [
      { sizes: "192x192", src: "/pwa/192", type: "image/png" },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/pwa/512",
        type: "image/png",
      },
    ],
    id: "/tr",
    lang: "tr",
    name: "Ranza",
    orientation: "portrait-primary",
    scope: "/",
    short_name: "Ranza",
    start_url: "/tr",
    theme_color: "#18332d",
  };
}
