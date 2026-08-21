// A view count only becomes worth decorating once it is genuinely unusual.
//
// The thresholds are deliberately high for where this marketplace is now:
// live listings sit at 3, 21 and 39 views, so nothing carries a badge yet.
// That is the point — a flame beside "3 vues" would be flattery, and once
// every listing has one it stops meaning anything. These fire only when a
// listing really is being looked at more than its neighbours.
//
// Ordered high to low; the first match wins.
const HEAT_TIERS = [
  { min: 500, emoji: "🔥" },
  { min: 200, emoji: "⚡" },
  { min: 50, emoji: "👀" },
];

export function viewHeatEmoji(count) {
  const views = Number(count) || 0;
  return HEAT_TIERS.find((tier) => views >= tier.min)?.emoji ?? null;
}

// The count with its badge in front, or just the count. Takes the already
// translated label so the caller keeps control of pluralisation.
export function withViewHeat(count, label) {
  const emoji = viewHeatEmoji(count);
  return emoji ? `${emoji} ${label}` : label;
}
