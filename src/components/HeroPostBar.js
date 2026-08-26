import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { fontFamily } from "../theme/typography";
import { spacing } from "../theme/colors";

// "Do you run one of these? List it" — in the hero, where it stays put.
//
// Every vertical in this app is two audiences at once: somebody looking for
// a garage, and the garage. The second one was consistently served last.
// An audit of thirteen screens found the invitation to publish sitting at
// 90%+ of the way down on seven of them, below a safety note and a filter
// panel and a list of everybody who got there first; on two more it existed
// only inside the empty state, which means it appeared when nothing matched
// and disappeared the moment something did — the more the screen found, the
// harder it was for the next one to join.
//
// A hero does not scroll. Putting the call there makes it reachable while
// somebody reads the screen rather than only after they have exhausted it,
// and makes it reachable at all on the screens where a full list used to
// hide it.
//
// The copy that used to sit under those cards is not carried up here. A bar
// is one line, and "Est-ce que votre garage est référencé ?" already says
// what the paragraph said. The form explains the rest.
//
// White, always. Every hero in the app is a saturated gradient of its own
// vertical's colour — teal for the wash, indigo for insurance, three blues
// for air conditioning — and a button tinted to match is the least visible
// thing in the block. White reads as a card sitting on top of the hero
// rather than a shape cut out of it. `ink` colours the glyph and the call,
// so the bar still belongs to its screen.
export function HeroPostBar({ icon, ink, label, cta, onPress }) {
  return (
    <Bar onPress={onPress}>
      <Disc tint={wash(ink)}>
        <Ionicons name={icon} size={15} color={ink} />
      </Disc>
      <Label numberOfLines={1}>{label}</Label>
      <Cta ink={ink}>
        <CtaLabel>{cta}</CtaLabel>
      </Cta>
    </Bar>
  );
}

function wash(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

const Bar = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-top: ${spacing.md}px;
  padding: 7px 7px 7px 9px;
  border-radius: 999px;
  background-color: #ffffff;
`;

const Disc = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.tint};
`;

// flex: 1 so the call sits hard against the right edge whatever the label
// says — these run from "Vous êtes chauffeur ?" to "Vous vendez ou montez
// des pneus ?" and a centred call would move screen to screen.
const Label = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #14171a;
`;

const Cta = styled.View`
  padding: 7px 14px;
  border-radius: 999px;
  background-color: ${(props) => props.ink};
`;

const CtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;
