import type { MetadataRoute } from "next";

// Lets phones add Digly to the home screen and open it full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Digly",
    short_name: "Digly",
    description: "A daily knowledge dig in three levels. The rarer the answer, the more it's worth.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#10162b",
    theme_color: "#10162b",
    categories: ["games", "education", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
