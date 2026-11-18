// What's free and what Digly Unlimited opens. Shared by the server (which
// enforces it) and the UI (which only shows it).

// Free players can replay this many past days in the Vault (yesterday back).
export const FREE_VAULT_DAYS = 3;

export const UNLIMITED = {
  name: "Digly Unlimited",
  priceCents: 500,
  currency: "usd",
  label: "$5",
};

// The purchase terms a buyer agrees to before checkout. Bump the version when
// the wording in /terms changes, so each purchase records what was agreed to.
export const PURCHASE_TERMS_VERSION = "2026-11-17";
export const NO_REFUND_LINE =
  "All sales are final. Digly Unlimited is not refundable, and it stays with the account you buy it on. It can't be moved to a different account.";

// Vault games 1..FREE_VAULT_GAMES are free; the rest need Digly Unlimited.
export const FREE_VAULT_GAMES = 3;

export function vaultGameOpen(game: number, unlimited: boolean) {
  return unlimited || game <= FREE_VAULT_GAMES;
}

export function vaultOpen(day: number, today: number, unlimited: boolean) {
  return unlimited || day >= today - FREE_VAULT_DAYS;
}
