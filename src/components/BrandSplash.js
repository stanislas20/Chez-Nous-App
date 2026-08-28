import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { fontFamily } from "../theme/typography";
import { BrandMark } from "./BrandMark";

// The opening screen: the tricolour passes, the brand stays.
//
// The three flag colours are used as a palette and never as a flag. Bénin's
// flag is a state symbol, and a private mark that reproduces it is both a
// legal risk and, at 20px, three smears. So they arrive as ribbons crossing
// the screen, leave, and what remains is the mark on its own — which is the
// version that ships as the app icon.
//
// The red is the one to watch. It is the same red the app uses for errors,
// and the brand never carries it. It appears here only in passing decoration
// — a ribbon, one bar of the rule, the third dot — and this is the only
// screen in the app where no alert can ever be shown, which is what makes
// that safe.
//
// Timings are the design's own: everything is over at 2.4s. Past that a
// splash stops being an entrance and becomes a wait, so the parts that loop
// — the breath and the dots — exist to cover a slow network without making
// the animation itself any longer.
const GROUND = "#00553A";
const GLOW = "#00C271";
const YELLOW = "#FCD116";
const RED = "#E8112D";
const MARK_GREEN = "#008751";

// When the last thing to arrive has arrived.
//
// The tagline is it, at 2000ms + 800ms. The design doc's total was 2400, which
// meant the splash began fading while it was still assembling itself — the
// rule settles at 2650 and the tagline at 2800, so the last two elements were
// being faded out as they faded in. Nothing about a screenshot would show
// that, which is why it survived; it only exists in motion.
const COMPOSED_MS = 2800;

// Then a beat of stillness on the finished brand before anything moves.
//
// This is the whole point of a splash and it is the part that was missing:
// without it the screen is only ever mid-assembly or mid-departure, and the
// composition the design is actually about is never once just sat there to be
// looked at.
export const SPLASH_HOLD_MS = 700;

// So the brand is on screen, complete and still, and only then leaves.
// scripts/check-splash.js pins COMPOSED_MS to what the animations actually
// do: adding a later element, or shortening one, would silently eat the hold.
export const SPLASH_MS = COMPOSED_MS + SPLASH_HOLD_MS;

// The hand-off to the app.
//
// It used to be a cut: onDone unmounted the splash in a single frame, so the
// brand was replaced by the feed with nothing in between. The app is already
// mounted and settled underneath by then, so fading the splash out is a
// genuine cross-dissolve rather than a curtain — the home screen is not
// arriving, it is being revealed.
//
// Long enough to read as deliberate, short enough not to be a delay. It costs
// nothing in perceived speed: the app is behind it, fully drawn, from the
// first frame of the fade.
export const SPLASH_EXIT_MS = 520;

const NAME = "Chez-Nous";

export function BrandSplash({ onDone, tagline, place, fontsReady = true }) {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(null);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => alive && setReduceMotion(enabled))
      // An unavailable setting is not a reason to refuse to animate.
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  // One driver per thing that moves. Native driver throughout: this runs
  // while the JS thread is still finishing the app's first render, and
  // anything on the bridge here stutters exactly when it is most visible.
  const bloom = useRef(new Animated.Value(0)).current;
  const ribbons = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const glow = useRef(new Animated.Value(0)).current;
  const plate = useRef(new Animated.Value(0)).current;
  const roof = useRef(new Animated.Value(0)).current;
  const door = useRef(new Animated.Value(0)).current;
  const letters = useRef(
    [...NAME].map(() => new Animated.Value(0)),
  ).current;
  const rule = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  // The dots have their own driver, separate from the text.
  //
  // They shared `words` until the fonts came off the critical path, and that
  // put them behind the font — which is backwards. The dots are the "still
  // working" signal, so the one start where they matter most is the slow one,
  // which is exactly the start where a font is most likely to be late.
  const foot = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  // When the choreography started, so the text can find its own place in it
  // however late the font turns up.
  const startedAt = useRef(Date.now()).current;
  // Drives the whole screen out. Separate from every other value here, which
  // brings things in.
  const exit = useRef(new Animated.Value(1)).current;

  // Fade out, then hand over. onDone is called from the completion callback
  // whether or not the animation finished cleanly — an interrupted fade that
  // never reported back would leave the splash on screen forever, which is a
  // worse failure than a fade that skips.
  const leave = () => {
    Animated.timing(exit, {
      toValue: 0,
      duration: reduceMotion ? 220 : SPLASH_EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onDone?.());
  };

  useEffect(() => {
    if (reduceMotion === null) return undefined;

    // Reduce motion is not "no splash"" — the brand still has to appear, and
    // a screen that blinks straight to the app is its own kind of jolt. It
    // is the travel that goes: everything fades up in place, and the
    // ribbons, the breath and the halo never run.
    if (reduceMotion) {
      const settle = Animated.timing(bloom, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      });
      // The text is set by the effect below, which waits for the font.
      [plate, roof, door, foot].forEach((value) => value.setValue(1));
      settle.start();
      const timer = setTimeout(() => leave(), 1200);
      return () => clearTimeout(timer);
    }

    const at = (value, delay, duration, easing = Easing.out(Easing.cubic)) =>
      Animated.timing(value, {
        toValue: 1,
        delay,
        duration,
        easing,
        useNativeDriver: true,
      });

    Animated.parallel([
      at(bloom, 0, 900),
      // Staggered by 120ms, the way three ribbons on a pole would pass.
      ...ribbons.map((value, index) =>
        at(value, 180 + index * 120, 2700, Easing.bezier(0.35, 0.75, 0.3, 1)),
      ),
      at(glow, 500, 1100),
      at(plate, 350, 900, Easing.bezier(0.25, 1.1, 0.4, 1)),
      // Overshoots and settles: the roof is dropped into place, not faded in.
      at(roof, 800, 850, Easing.bezier(0.3, 1.5, 0.5, 1)),
      at(door, 1150, 700),
      at(rule, 1750, 900),
      at(foot, 1900, 700),
    ]).start();

    // The two loops that cover a slow start.
    const haloLoop = Animated.loop(
      Animated.timing(halo, {
        toValue: 1,
        duration: 3400,
        delay: 1900,
        easing: Easing.bezier(0.2, 0.7, 0.3, 1),
        useNativeDriver: true,
      }),
    );
    const dotLoops = dots.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 625,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 625,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    haloLoop.start();
    dotLoops.forEach((loop) => loop.start());

    const timer = setTimeout(() => leave(), SPLASH_MS);
    return () => {
      clearTimeout(timer);
      haloLoop.stop();
      dotLoops.forEach((loop) => loop.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // The wordmark waits for its face.
  //
  // This is what lets the splash start before the fonts have loaded. The
  // first 1.3s of the animation is the ground, the ribbons, the plate and the
  // mark — no text at all — so the font has that long to arrive without
  // anybody waiting for it, and the app no longer holds the native splash up
  // until it does.
  //
  // If the font is already there, these run at the times the design gives
  // them. If it turns up later than that, they run at once rather than at a
  // delay that has already passed — the letters appear a little late, which
  // is what the reader would have waited for anyway, instead of the wordmark
  // rendering in the system face and swapping under them.
  useEffect(() => {
    if (reduceMotion === null || !fontsReady) return undefined;
    if (reduceMotion) {
      [rule, words, ...letters].forEach((value) => value.setValue(1));
      return undefined;
    }
    const elapsed = Date.now() - startedAt;
    const after = (planned) => Math.max(0, planned - elapsed);
    const run = Animated.parallel([
      ...letters.map((value, index) =>
        Animated.timing(value, {
          toValue: 1,
          delay: after(1300 + index * 50),
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
      Animated.timing(words, {
        toValue: 1,
        delay: after(2000),
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, fontsReady]);

  // Nothing is drawn until the accessibility setting has been read, so the
  // first frame is never the wrong one.
  if (reduceMotion === null) return <View style={styles.ground} />;

  const travel = width * 1.9;
  const ribbonStyle = (value, index) => ({
    opacity: value.interpolate({
      inputRange: [0, 0.16, 0.64, 1],
      outputRange: [0, 0.92, 0.92, 0],
    }),
    transform: [
      {
        translateX: value.interpolate({
          inputRange: [0, 1],
          outputRange: [-travel * 0.58, travel * 0.62],
        }),
      },
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [height * 0.54, -height * 0.58],
        }),
      },
      { rotate: "-19deg" },
    ],
  });

  return (
    <Animated.View style={[styles.ground, { opacity: exit }]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: GROUND,
            opacity: bloom,
            transform: [
              {
                scale: bloom.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.35, 1],
                }),
              },
            ],
          },
        ]}
      />

      {/* The tricolour, passing. Wide enough to cross the corner at this
          angle without either end ever showing. */}
      {[GLOW, YELLOW, RED].map((colour, index) => (
        <Animated.View
          key={colour}
          pointerEvents="none"
          style={[
            styles.ribbon,
            {
              backgroundColor: colour,
              width: width * 2.2,
              top: height * (0.3 + index * 0.14),
            },
            ribbonStyle(ribbons[index], index),
          ]}
        />
      ))}

      {/* A radial gradient, faked in four steps.
          expo-linear-gradient cannot draw one, and a single translucent
          circle is not a glow — it is a disc with a hard edge, which is
          exactly how the first version looked. Four concentric circles at a
          low alpha each accumulate toward the middle and stop abruptly
          nowhere, which is all a glow has to do. */}
      {[1.3, 1.0, 0.72, 0.46].map((scale, index) => (
        <Animated.View
          key={scale}
          pointerEvents="none"
          style={[
            styles.glow,
            {
              width: width * scale,
              height: width * scale,
              borderRadius: (width * scale) / 2,
              marginLeft: (-width * scale) / 2,
              marginTop: (-width * scale) / 2,
              opacity: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.1],
              }),
              transform: [
                {
                  scale: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.55 + index * 0.05, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}

      <View style={styles.centre}>
        <View style={styles.markWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                opacity: halo.interpolate({
                  inputRange: [0, 0.7, 1],
                  outputRange: [0.55, 0, 0],
                }),
                transform: [
                  {
                    scale: halo.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.7, 1.9],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.plate,
              {
                opacity: plate,
                transform: [
                  {
                    scale: plate.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.86, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <BrandMark
              size={118}
              color={MARK_GREEN}
              roofStyle={{
                opacity: roof,
                transform: [
                  {
                    translateY: roof.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-26, 0],
                    }),
                  },
                ],
              }}
              doorStyle={{
                opacity: door,
                // Grows up from the threshold, so the door opens rather than
                // appearing already open.
                transform: [
                  { translateY: 34 },
                  {
                    scaleY: door.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 1],
                    }),
                  },
                  { translateY: -34 },
                ],
              }}
            />
          </Animated.View>
        </View>

        <View style={styles.wordmarkBlock}>
          <View style={styles.wordmark}>
            {[...NAME].map((glyph, index) => (
              <Animated.Text
                key={`${glyph}-${index}`}
                style={[
                  styles.glyph,
                  {
                    opacity: letters[index],
                    transform: [
                      {
                        translateY: letters[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [16, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {glyph}
              </Animated.Text>
            ))}
          </View>

          {/* The rule is the flag's proportions in miniature, and the only
              place the three colours sit still. */}
          <Animated.View
            style={[
              styles.rule,
              {
                opacity: rule,
                transform: [{ scaleX: rule }],
              },
            ]}
          >
            <View style={[styles.ruleBar, { backgroundColor: GLOW }]} />
            <View style={[styles.ruleBar, { backgroundColor: YELLOW }]} />
            <View style={[styles.ruleBar, { backgroundColor: RED }]} />
          </Animated.View>

          <Animated.Text
            style={[
              styles.tagline,
              {
                opacity: words,
                transform: [
                  {
                    translateY: words.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {tagline}
          </Animated.Text>
        </View>
      </View>

      <Animated.View style={[styles.foot, { opacity: foot }]}>
        <View style={styles.dots}>
          {[GLOW, YELLOW, RED].map((colour, index) => (
            <Animated.View
              key={colour}
              style={[
                styles.dot,
                {
                  backgroundColor: colour,
                  opacity: dots[index].interpolate({
                    inputRange: [0, 0.45, 1],
                    outputRange: [0.55, 1, 0.55],
                  }),
                  transform: [
                    {
                      translateY: dots[index].interpolate({
                        inputRange: [0, 0.45, 1],
                        outputRange: [0, -4, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
        {/* The label is text and waits for the face; the dots above it do
            not. */}
        <Animated.Text style={[styles.place, { opacity: words }]}>
          {place}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ground: { ...StyleSheet.absoluteFillObject, backgroundColor: GROUND },
  ribbon: { position: "absolute", left: 0, height: 96 },
  glow: { position: "absolute", left: "50%", top: "41%", backgroundColor: GLOW },
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 30,
    paddingBottom: 48,
  },
  markWrap: {
    width: 172,
    height: 172,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 172,
    height: 172,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.24)",
  },
  plate: {
    width: 118,
    height: 118,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    shadowColor: "#00140C",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    elevation: 16,
  },
  // Stretched, not shrink-wrapped.
  //
  // With `alignItems: center` alone this column is only as wide as its widest
  // child — the wordmark — and the tagline underneath is wider than
  // "Chez-Nous". So the tagline was being laid out into 470px when it needed
  // about 490, and Android dropped the last word rather than wrapping it: the
  // line read "Le Bénin, à portée de". Nothing looked clipped, so it read as
  // copy someone had written short.
  //
  // Stretching the column gives both lines the full width and lets textAlign
  // do the centring, which is also immune to the measurement error Android
  // makes on letterSpacing — it never has to shrink-wrap the text at all.
  wordmarkBlock: { alignSelf: "stretch", alignItems: "center", gap: 9 },
  wordmark: { flexDirection: "row" },
  glyph: {
    fontFamily: fontFamily.semiBold,
    fontSize: 39,
    lineHeight: 46,
    letterSpacing: -1.3,
    color: "#ffffff",
  },
  rule: { flexDirection: "row", gap: 3 },
  ruleBar: { width: 26, height: 5, borderRadius: 3 },
  tagline: {
    marginTop: 3,
    // Full width, centred by textAlign. Padding was the first attempt and it
    // made things worse — it took width away from a line that was already
    // short of it.
    alignSelf: "stretch",
    textAlign: "center",
    fontFamily: fontFamily.medium,
    fontSize: 13,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.92)",
  },
  foot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 52,
    alignItems: "center",
    gap: 16,
  },
  dots: { flexDirection: "row", gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  place: {
    // Same treatment, and it needs it more: at 1.7 the tracking is four times
    // the tagline's, so "COTONOU · BÉNIN" lost a whole word off a two-word
    // line even with the width of the screen beneath it.
    alignSelf: "stretch",
    textAlign: "center",
    fontFamily: fontFamily.bold,
    fontSize: 10.5,
    letterSpacing: 1.7,
    color: "#ffffff",
  },
});
