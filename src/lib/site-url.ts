export function getSiteUrl() {
  const configuredSiteUrl = (import.meta.env.VITE_SITE_URL || "").trim();
  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "";
}

export function getResetPasswordRedirectUrl() {
  const siteUrl = getSiteUrl();
  return siteUrl ? `${siteUrl}/reset-password` : "/reset-password";
}
