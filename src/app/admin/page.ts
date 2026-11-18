// The admin panel. A .ts file on purpose: the offline static build only picks
// up .tsx pages, so this page (which needs the server) stays out of it.
import { createElement } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdminPlayer } from "@/server/game";
import { AdminPanel } from "@/ui/admin/AdminPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Digly admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  let me = "";
  try {
    me = (await requireAdminPlayer()).username;
  } catch {
    // not logged in, or not an admin: act like the page doesn't exist
    notFound();
  }
  return createElement(AdminPanel, { me });
}
