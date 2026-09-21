export function normalizeReferralCode(value: string) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function generateReferralCodeFromName(fullName: string) {
  const rawName = String(fullName ?? "").trim();
  const firstName = rawName.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "USER";
  const base = firstName.toUpperCase() || "USER";
  const safeBase = base.length > 8 ? base.slice(0, 8) : base;
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `${safeBase.length >= 3 ? safeBase : "USER"}${suffix}`;
}

export function buildReferralLink(code: string, baseUrl?: string) {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return "";

  const siteRoot = (baseUrl ?? "").replace(/\/+$/, "");
  const path = "/signup?ref=" + encodeURIComponent(normalized);

  return siteRoot ? `${siteRoot}${path}` : path;
}
