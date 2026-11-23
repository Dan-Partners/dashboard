import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dan",
    short_name: "Dan",
    description: "The counter for a Chinese takeaway, connected to the shop server.",
    start_url: "/",
    display: "standalone",
    background_color: "#F5EEDC",
    theme_color: "#B83A2E",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
