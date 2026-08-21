// One rule for every wrapped grid in the app: the last row is never allowed
// to leave a hole.
//
// A flex-wrap grid whose item count is not a multiple of its column count
// ends on a short row, and a lone tile sitting against a gap of empty space
// reads as a layout bug rather than as the end of a list. So the leftovers
// stretch to fill the row instead: one leftover spans the whole width, two
// leftovers in a three-column grid split it.
//
// This lived as a private helper in SellerDashboardScreen and as three
// hand-written `length % 2 === 1 && index === length - 1` checks in
// VehicleListScreen. Same rule four times is the shape of a rule that gets
// forgotten on the fifth grid, so it is one function now.
//
// The full-row percentages are deliberately a hair under 100 / n: the gap
// between items is real width, and asking for exactly a third of the row
// three times wraps the third item onto its own line.
const FULL_WIDTH = {
  1: "100%",
  2: "48.4%",
  3: "31.6%",
};

export function gridItemWidth(index, total, columns = 3) {
  const remainder = total % columns;
  const isLastRow = remainder !== 0 && index >= total - remainder;
  const span = isLastRow ? remainder : columns;
  return FULL_WIDTH[span] ?? FULL_WIDTH[columns];
}

// The same question asked as a boolean, for grids that flag the odd one out
// on the item itself because a label row and a value row both have to read
// the same fact.
export function isLastRowOrphan(index, total, columns = 2) {
  const remainder = total % columns;
  return remainder !== 0 && index >= total - remainder;
}
