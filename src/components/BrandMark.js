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
