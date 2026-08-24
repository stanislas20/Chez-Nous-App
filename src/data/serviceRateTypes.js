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
    key: "quote",
    icon: "chatbubble-ellipses-outline",
    color: "#A15AC4",
    labelEn: "On request",
    labelFr: "Sur devis",
  },
];

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
