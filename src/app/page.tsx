import type { Metadata } from "next";
import { GameShell } from "@/ui/GameShell";
import { dayNumber, formatChallengeNumber } from "@/game/rules/schedule";
import { DESCRIPTION, OG_IMAGE } from "./layout";

// Rebuilt every few minutes so shared links show today's dig number.
export const revalidate = 300;

// Next replaces (doesn't merge) openGraph and twitter, so they're given in full.
export function generateMetadata(): Metadata {
  const title = `Digly ${formatChallengeNumber(dayNumber(Date.now()))} · Dig deep.`;
  return {
    title,
    openGraph: { type: "website", siteName: "Digly", url: "/", title, description: DESCRIPTION, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [OG_IMAGE.url] },
  };
}

export default function Page() {
  return <GameShell />;
}
