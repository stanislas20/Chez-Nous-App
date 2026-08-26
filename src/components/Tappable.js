import { useRef } from "react";
import { Animated, Pressable } from "react-native";

// A button that answers the finger.
//
// The motion here is not new: ListingCard and LanguageSelectScreen have both
// sprung to 0.97 on press for a long time, each with their own copy of the
// same six lines. Everything else in the app was a bare Pressable that did
// nothing at all when touched — so a tap either felt immediate or felt
// broken depending on which control you happened to hit, which is worse
// than a screen with no motion anywhere.
//
// The values are theirs, not mine: 0.97, speed 40, bounciness 6. Matching
// them matters more than choosing better ones, because the two cards that
// already moved are the reference a user's hand has been calibrated against.
//
// Native driver throughout: this runs on every card in a scrolling list, and
// a scale that stutters while the list is moving is worse than no scale.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function usePressScale(pressedScale = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (toValue) =>
    Animated.spring(scale, {
      toValue,
      speed: 40,
      bounciness: 6,
      useNativeDriver: true,
    }).start();

  return {
    scale,
    pressProps: {
      onPressIn: () => springTo(pressedScale),
      onPressOut: () => springTo(1),
    },
  };
}

// Drop-in for Pressable, including under styled(): `styled(Tappable)` styles
// it exactly as `styled(Pressable)` did, and each rendered instance owns its
// own animation — which is what lets it be used inside a list's map without
// calling a hook in a loop.
//
// `scaleTo` exists for the few controls where 0.97 is wrong: a full-width
// card needs less travel than a small pill to read as the same movement.
export function Tappable({ children, style, scaleTo, ...rest }) {
  const { scale, pressProps } = usePressScale(scaleTo);
  return (
    <AnimatedPressable
      {...pressProps}
      {...rest}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
