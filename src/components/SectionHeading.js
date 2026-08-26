import styled from "styled-components/native";
import { type } from "../theme/typography";

// One header for every section, on every screen, and no emoji in it.
//
// This began inside ForYouScreen, where six sections each opened with a
// different pictogram — 🏆 💼 🔥 ⭐ 📍 🎯 — which is six accent colours the
// palette never agreed to, competing with the cards underneath. A short
// rule above the title separates one band from the next and does it the
// same way every time.
//
// It moved here because Local was doing the same job with its own
// component: plain bold text, no rule, a different size. Two tabs a thumb
// apart in the same tab bar, drawing the same idea two ways.
//
// Three slots, all optional except the label:
//   meta   — a fact about the section, right-aligned on the title row.
//            A count belongs here, not in a banner of its own.
//   action — a control, same place as meta. "Voir toutes", typically.
//            Pass one or the other; they occupy the same corner.
const EMERALD = "#0B6E4F";

export function SectionHeading({ label, meta, action }) {
  return (
    <SectionHeadingWrap>
      <SectionRule />
      <SectionTitleRow>
        <SectionTitle numberOfLines={2}>{label}</SectionTitle>
        {action ?? (meta ? <SectionMeta>{meta}</SectionMeta> : null)}
      </SectionTitleRow>
    </SectionHeadingWrap>
  );
}

const SectionHeadingWrap = styled.View`
  gap: 9px;
  margin-bottom: 14px;
`;

// Short and heavy rather than a full-width hairline: it reads as a mark
// against the title, not as a divider closing the section above.
const SectionRule = styled.View`
  width: 26px;
  height: 3px;
  border-radius: 2px;
  background-color: ${EMERALD};
`;

const SectionTitleRow = styled.View`
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`;

const SectionTitle = styled.Text`
  ${type.h3}
  letter-spacing: -0.2px;
  flex-shrink: 1;
  color: ${(props) => props.theme.text};
`;

const SectionMeta = styled.Text`
  ${type.caption}
  font-size: 12px;
  color: ${(props) => props.theme.textMuted};
`;
