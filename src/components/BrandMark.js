import { Animated, View } from "react-native";

// The Chez-Nous mark: a roof over an open door.
//
// Drawn with plain views rather than SVG, because react-native-svg is not in
// this project and adding it would mean a native dependency and a rebuild for
// two strokes and an arch. The geometry below is the design's own 64×64
// artboard, kept as those numbers and scaled at the end, so a change to the
// drawing can be read against the source without converting anything.
//
//   roof  M14 31.5  L32 17  L50 31.5      two strokes meeting at an apex
//   door  M25 47 V37.5 a7 7 0 0 1 14 0 V47   an arch, not a rectangle
//
// The door is an arch on purpose: a rectangle reads as a closed box, and the
// whole point of the name is a door standing open.
//
// ONE STROKE AT EVERY SIZE, and it is 4.6.
//
// The design doc previews a heavier 6.4 for 20px, on the reasonable theory
// that a thin stroke disappears when small. Rendered at 20, 24, 32 and 48 and
// downsampled the way an OS rasterises an icon, the opposite is true: 4.6
// survives 20px intact, and 6.4 is visibly too heavy by 48 — the roof and the
// door close up on each other.
//
// That gap between them is not decoration, it is the whole mark. Ionicons'
// `home-outline` — a roof joined to a body — is the icon in this app's own
// tab bar under "Pour vous". What keeps the brand from reading as that button
// is the daylight under the roof, and a heavier stroke spends it: 2.6px of
// clearance at 20px becomes 2.0px. scripts/check-brand-mark.js holds the
// floor, because "make the logo a bit bolder" is the most reasonable-sounding
// way this gets lost.
const BOX = 64;
const STROKE = 4.6;

// The roof, as two bars rotated about their own left end. Both are the same
// length and mirror each other, so only one angle is computed.
const APEX_X = 32;
const APEX_Y = 17;
const EAVE_X = 14;
const EAVE_Y = 31.5;
const RUN = APEX_X - EAVE_X; // 18
const RISE = EAVE_Y - APEX_Y; // 14.5
const RAFTER = Math.sqrt(RUN * RUN + RISE * RISE);
const PITCH = (Math.atan2(RISE, RUN) * 180) / Math.PI;

// The door. The path is a centre line, so the view that draws it is half a
// stroke wider and taller on every open side, and its corner radius is the
// arc's radius plus that same half stroke.
const DOOR_LEFT = 25;
const DOOR_RIGHT = 39;
const DOOR_BOTTOM = 47;
const ARC_R = 7;
const ARC_CY = 37.5;
const DOOR_W = DOOR_RIGHT - DOOR_LEFT + STROKE;
const DOOR_TOP = ARC_CY - ARC_R - STROKE / 2;
const DOOR_H = DOOR_BOTTOM - DOOR_TOP;

// The smallest the mark is ever drawn — app icon, notification badge, the
// 20px proof in the design doc.
export const MARK_MIN_PX = 20;

// Daylight between the underside of the roof and the top of the door, in
// artboard units. Both edges move toward each other as the stroke grows, so
// this shrinks twice as fast as the stroke does.
export function roofToDoorGap(stroke = STROKE) {
  const pitch = Math.atan2(EAVE_Y - APEX_Y, APEX_X - EAVE_X);
  // At the apex the bar is cut across its width, so its underside sits half a
  // stroke below the centre line measured perpendicular to the slope.
  const roofUnderside = APEX_Y + stroke / 2 / Math.cos(pitch);
  const doorTopEdge = ARC_CY - ARC_R - stroke / 2;
  return doorTopEdge - roofUnderside;
}

export function BrandMark({ size = 64, color = "#0B6E4F", style, roofStyle, doorStyle }) {
  const u = size / BOX;
  const bar = {
    position: "absolute",
    height: STROKE * u,
    width: RAFTER * u,
    borderRadius: (STROKE / 2) * u,
    backgroundColor: color,
    top: (EAVE_Y - STROKE / 2) * u,
  };

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.View style={[{ width: size, height: size }, roofStyle]}>
        {/* Rotated about the left end so the two bars meet exactly at the
            apex — the default origin is the centre, which would open a gap
            there that grows with the stroke. */}
        <View
          style={[
            bar,
            {
              left: EAVE_X * u,
              transform: [
                { translateX: (-RAFTER / 2) * u },
                { rotate: `${-PITCH}deg` },
                { translateX: (RAFTER / 2) * u },
              ],
            },
          ]}
        />
        <View
          style={[
            bar,
            {
              left: (BOX - EAVE_X - RAFTER) * u,
              transform: [
                { translateX: (RAFTER / 2) * u },
                { rotate: `${PITCH}deg` },
                { translateX: (-RAFTER / 2) * u },
              ],
            },
          ]}
        />
      </Animated.View>

      <Animated.View
        style={[
          {
            position: "absolute",
            left: (DOOR_LEFT - STROKE / 2) * u,
            top: DOOR_TOP * u,
            width: DOOR_W * u,
            height: DOOR_H * u,
            borderColor: color,
            borderWidth: STROKE * u,
            borderBottomWidth: 0,
            borderTopLeftRadius: (ARC_R + STROKE / 2) * u,
            borderTopRightRadius: (ARC_R + STROKE / 2) * u,
          },
          doorStyle,
        ]}
      />
    </View>
  );
}
