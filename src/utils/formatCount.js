// Compact counts for the profile stat row: 1 234 -> 1,2 k.
//
// Rounded down rather than to nearest, so a number never reads higher than
// what it counts — "1,3 k followers" on 1 250 overstates it, and these are
// the figures a business is judged on.
//
// French uses a comma for the decimal mark and a space before the unit;
// English doesn't. Both are passed the active language rather than relying
// on the device locale, which can differ from the app's.
export function formatCount(value, language = "fr") {
  const count = Number(value) || 0;
  if (count < 1000) return String(count);

  const isEnglish = language === "en";
  const decimal = isEnglish ? "." : ",";
  const space = isEnglish ? "" : " ";

  const format = (scaled, unit) => {
    const truncated = Math.floor(scaled * 10) / 10;
    // 12,0 k reads worse than 12 k, and carries no more information.
    const text =
      truncated % 1 === 0 ? String(truncated) : truncated.toFixed(1).replace(".", decimal);
    return `${text}${space}${unit}`;
  };

  if (count < 1_000_000) return format(count / 1000, "k");
  return format(count / 1_000_000, "M");
}

// Which of the two label keys a count takes.
//
// The rule differs by language and the screens are French-first, so this
// can't be a single `count === 1` test: French uses the singular for zero
// as well ("0 abonné"), English does not ("0 followers"). Left as visibly
// wrong once already — "1 ABONNEMENTS" — which is what prompted this.
export function statLabelKey(baseKey, count, language = "fr") {
  const value = Number(count) || 0;
  const isSingular = language === "en" ? value === 1 : value < 2;
  return isSingular ? `${baseKey}One` : baseKey;
}
