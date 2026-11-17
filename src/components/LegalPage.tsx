import Link from "next/link";

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacy@digly.io";
export const UPDATED = "November 17, 2026";

// Plain readable page for the policies. The game page locks scrolling, so this scrolls itself.
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal">
      <div className="legal-inner">
        <Link href="/" className="legal-back">
          ← Back to the dig
        </Link>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {UPDATED}</p>
        {children}
        <p className="legal-foot">
          <Link href="/privacy">Privacy policy</Link> · <Link href="/terms">Terms of use</Link> · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </div>
    </main>
  );
}
