import { headers } from "next/headers";

// GET /api/region -> { country } from Vercel's geo header, or null elsewhere.
// Only used to decide whether to ask before turning analytics on.
export async function GET() {
  const c = (await headers()).get("x-vercel-ip-country");
  return Response.json({ country: c && /^[A-Z]{2}$/i.test(c) ? c.toUpperCase() : null }, { headers: { "cache-control": "private, no-store" } });
}
