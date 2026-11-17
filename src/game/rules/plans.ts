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

export function vaultOpen(day: number, today: number, unlimited: boolean) {
  return unlimited || day >= today - FREE_VAULT_DAYS;
}
