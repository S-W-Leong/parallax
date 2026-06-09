const DEMO_USER_KEY = "parallax.demoUserId";

export function getDemoUserId(): string {
  if (typeof window === "undefined") return "demo-server";

  const existing = window.localStorage.getItem(DEMO_USER_KEY);
  if (existing) return existing;

  const created = `demo-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEMO_USER_KEY, created);
  return created;
}
