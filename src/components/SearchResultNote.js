import styled from "styled-components/native";
import { useI18n } from "../i18n/I18nContext";
import { useTheme } from "../theme/ThemeContext";
import { spacing } from "../theme/colors";
import { fontFamily, type } from "../theme/typography";

// What the search could not prove, said in one line.
//
// The re-audit found the honest-cap machinery wired to nothing: the hook
// computed `total` and `complete` and no screen read either, so a reader
// still saw sixty results with no hint that there were three hundred, and
// saw a bare "no results" on a search that had only looked at part of the
// catalogue.
//
// This is deliberately quiet. An ordinary search that found everything it
// was asked for renders NOTHING — the common case must not grow a banner.
// The line appears only when the search cannot stand behind what it showed:
//
//   complete            nothing is drawn
//   more matches exist  "Showing 60 of 340 results"
//   upper bound only    "…of about 340 matches"
//   empty + incomplete  "Nothing found in the results we could check…"
//
// The last one matters most. A zero-result search that was exhaustive means
// "there is none"; one that was not means "we did not look everywhere", and
// those are different sentences to show somebody trying to buy a fridge.
const Note = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: ${type.caption.size}px;
  line-height: ${type.caption.line}px;
  color: ${({ theme }) => theme.textMuted};
  padding: 0 ${spacing.md}px ${spacing.sm}px;
`;

export function SearchResultNote({ shown, total, complete, totalIsExact }) {
  const { t } = useI18n();
  const { colors } = useTheme();

  // The whole point: silence when the search is sound.
  if (complete) return null;

  if (!shown) {
    return <Note theme={colors}>{t("searchNoResultsPartial")}</Note>;
  }

  // A total below what is on screen would read as nonsense; fall back to the
  // plain "there is more" line rather than printing an impossible ratio.
  if (typeof total !== "number" || total <= shown) {
    return <Note theme={colors}>{t("searchMoreRefine")}</Note>;
  }

  return (
    <Note theme={colors}>
      {t(totalIsExact ? "searchShowingOf" : "searchShowingOfApprox", {
        shown,
        total,
      })}
    </Note>
  );
}
