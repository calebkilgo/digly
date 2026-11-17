import type { ChallengeService } from "./types";

export type AnyService = ChallengeService & { reset(): Promise<void>; resetDay?(day: number): Promise<void> };

// The deployed site always talks to the server. Only the static preview build
// (NEXT_PUBLIC_DIGLY_BACKEND=local) loads the in-browser engine, and the
// branch is a build-time constant so the answer lists stay out of the bundle.
export async function createService(): Promise<AnyService> {
  if (process.env.NEXT_PUBLIC_DIGLY_BACKEND === "local") {
    const { LocalService } = await import("./local");
    return new LocalService();
  }
  const { RemoteService } = await import("./remote");
  return new RemoteService();
}
