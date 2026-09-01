import { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius } from "../theme/colors";
import { fontFamily } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { usePressScale } from "./Tappable";

// One chip, for every horizontal filter rail in the app.
//
// There were two of these. The Other category had aisle chips — a pill with
// a count in a rounded badge — and the category and trade rails were built
// afterwards with their own pill, a different padding, a different type
// size, an inline count and a hardcoded white instead of theme.textInverse.
// Three rails, two shapes, and the difference was invisible unless you put
// the screens side by side.
//
// So the shape lives here and the screens pass content. The icon is optional
// because a custom aisle is a word somebody typed and has no icon to show,
// while a category and a trade both do.
//
// `count` is rendered whenever it is a number, zero included: a rail is
// built from what exists, so a zero is worth seeing if it ever appears
// rather than silently reading as "no badge".
// `accent` is optional and defaults to the app's green. Événements is the
// one rail that is not green — the whole screen is plum — and without this
// it had to grow its own chip, which is exactly the duplication this
// component was written to end.
export function RailChip({ icon, label, count, selected, onPress, accent }) {
  const { colors } = useTheme();

  // The app's press spring, not a new one. Tappable makes the case for
  // matching rather than improving: the cards that already move are what a
  // user's hand is calibrated against.
  //
  // 0.94 rather than its 0.97 for the reason Tappable itself gives — a full
  // -width card needs less travel than a small pill to read as the same
  // movement, and a chip is the smallest control here.
  const { scale, pressProps } = usePressScale(0.94);

  // A short pop when a chip BECOMES selected.
  //
  // Choosing a category rewrites the whole list underneath, and without this
  // the only acknowledgement is a fill colour changing at the top of a
  // screen whose content has just moved — so the eye follows the content and
  // misses which chip it pressed. The pop is the receipt.
  //
  // Only on the way in. Firing it on deselect too would mean two chips
  // animating at once every time somebody switches category, which reads as
  // a glitch rather than an answer.
  //
  // Deliberately not a colour animation, which is the obvious other choice:
  // colour cannot run on the native driver, and this sits at the top of a
  // list that is re-rendering as it plays.
  const pop = useRef(new Animated.Value(1)).current;
  const wasSelected = useRef(selected);
  useEffect(() => {
    if (selected === wasSelected.current) return;
    wasSelected.current = selected;
    if (!selected) return;
    Animated.sequence([
      Animated.spring(pop, {
        toValue: 1.06,
        speed: 50,
        bounciness: 12,
        useNativeDriver: true,
      }),
      Animated.spring(pop, {
        toValue: 1,
        speed: 40,
        bounciness: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [selected, pop]);

  return (
    <Chip
      {...pressProps}
      selected={selected}
      accent={accent}
      onPress={onPress}
      // Two scales rather than one value driven by both: press and selection
      // overlap constantly — you are pressing the chip that is about to
      // become selected — and a single value would have one cancel the
      // other. Transforms compose, so they multiply instead.
      style={{ transform: [{ scale }, { scale: pop }] }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={selected ? colors.textInverse : colors.textMuted}
        />
      ) : null}
      <ChipLabel selected={selected} numberOfLines={1}>
        {label}
      </ChipLabel>
      {typeof count === "number" ? (
        <ChipCount selected={selected}>
          <ChipCountLabel selected={selected}>{count}</ChipCountLabel>
        </ChipCount>
      ) : null}
    </Chip>
  );
}

// 44px is the floor, not the aim: below it a chip is a target people miss,
// and the inherited 9px/13px pill came out at about 34. The padding sets the
// shape and min-height guarantees the target even when a chip carries no
// icon and no count and would otherwise collapse to the height of its text.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const Chip = styled(AnimatedPressable)`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  max-width: 260px;
  min-height: 44px;
  padding: 11px 16px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? (props.accent ?? props.theme.primary) : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.selected ? (props.accent ?? props.theme.primary) : props.theme.border};
`;

const ChipLabel = styled.Text`
  flex-shrink: 1;
  font-family: ${(props) =>
    props.selected ? fontFamily.bold : fontFamily.medium};
  font-size: 14px;
  color: ${(props) =>
    props.selected ? props.theme.textInverse : props.theme.text};
`;

const ChipCount = styled.View`
  padding: 2px 7px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.selected ? "rgba(255, 255, 255, 0.24)" : props.theme.surfaceAlt};
`;

const ChipCountLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 12px;
  color: ${(props) =>
    props.selected ? props.theme.textInverse : props.theme.textMuted};
`;
