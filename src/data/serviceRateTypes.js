// How a service is priced.
//
// Services were falling through to the item-for-sale form, which asks what
// condition the listing is in — a plumber has no "Comme neuf" — and demands
// a single fixed price above zero. Neither fits: most trades quote by the
// hour or the day, and plenty can't quote at all until they've seen the
// job.
//
// This replaces the condition selector, and it decides whether a price is
// even required: `quote` means the amount is agreed after contact, so the
// form stops insisting on a number nobody can honestly give yet.
export const serviceRateTypes = [
  {
    key: "fixed",
    icon: "pricetag-outline",
    color: "#12876A",
    labelEn: "Fixed price",
    labelFr: "Prix fixe",
  },
  {
    key: "hourly",
    icon: "time-outline",
    color: "#2F6BB5",
    labelEn: "Per hour",
    labelFr: "Par heure",
  },
  {
    key: "daily",
    icon: "calendar-outline",
    color: "#B98A2A",
    labelEn: "Per day",
    labelFr: "Par jour",
  },
  {
    key: "from",
    icon: "trending-up-outline",
    color: "#C1512D",
    labelEn: "Starting from",
    labelFr: "À partir de",
  },
  {
    // Per square metre. The trades that quote this way — a tiler, a
    // painter, a mason — cannot answer "how much" without it, and were
    // choosing "sur devis" for work whose price is entirely predictable
    // once the surface is known.
    key: "perSqm",
    icon: "grid-outline",
    color: "#5BA83A",
    labelEn: "Per m²",
    labelFr: "Au m²",
  },
  {
    key: "quote",
    icon: "chatbubble-ellipses-outline",
    color: "#A15AC4",
    labelEn: "On request",
    labelFr: "Sur devis",
  },
];

// Per-m² is not a rate every trade can use.
//
// It was offered to everybody, so somebody publishing a mechanic's garage
// was asked whether he charges by the square metre — a question with no
// sensible answer, which teaches the seller that the form does not know
// what it is asking about. Surface is how a mason, a tiler and a painter
// price work, and nobody else here.
//
// Deliberately a short list rather than a flag on each trade: if a fourth
// trade ever prices by surface it belongs in this line, where the reason
// is written down, and not scattered across sixty entries.
const PER_SQM_TRADES = new Set(["mason", "tiler", "painter"]);

// The rates worth offering for a trade. With no trade chosen yet, per-m²
// stays hidden: showing it and taking it away again is worse than never
// offering it, and the trades that use it are asked for it by name.
export function serviceRateTypesForTrade(trade) {
  if (PER_SQM_TRADES.has(trade)) return serviceRateTypes;
  return serviceRateTypes.filter((item) => item.key !== "perSqm");
}

export function getServiceRateType(key) {
  return serviceRateTypes.find((item) => item.key === key) ?? null;
}

export function getServiceRateLabel(key, language) {
  const rate = getServiceRateType(key);
  if (!rate) return null;
  return language === "en" ? rate.labelEn : rate.labelFr;
}

// Only `quote` skips the amount — every other rate is a number the provider
// can state up front, and leaving it blank would publish a service with no
// pricing at all.
export function serviceRateNeedsAmount(key) {
  return !!key && key !== "quote";
}
