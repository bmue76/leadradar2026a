export const UI = {
  bg: "#FFFFFF",
  text: "#111827",
  muted: "rgba(17,24,39,0.55)",
  border: "rgba(17,24,39,0.10)",

  padX: 16,
  padTop: 10,
  padBottom: 12,

  tenantFontSize: 12,
  titleFontSize: 30, // Single Source of Truth
  titleWeight: "900" as const,

  tenantToTitleGap: 10,

  // Tenant logo sizing (responsive via clamp in AppHeader)
  // Ziel: nicht zu klein auf grossen Geräten, nicht zu breit auf kleinen Geräten
  logoHeight: 36,          // ~ +30% vs 28 (dein Feedback “zu klein”)
  logoWidthRatio: 0.62,    // Anteil der Content-Breite (nach Padding)
  logoWidthMin: 160,
  logoWidthMax: 260,

  poweredByGap: 6,
  poweredByLogoHeight: 23, // ~+15% gegenüber 20
  poweredByUrl: "https://www.leadradar.ch",

  tabBarBaseHeight: 56,
  tabBarPadTop: 8,
  tabBarPadBottomMin: 8,

  accent: "#DC2626", // LeadRadar default
};
