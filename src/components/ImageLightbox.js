import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StatusBar, useWindowDimensions } from "react-native";
import {
  FlatList,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import * as ScreenOrientation from "expo-screen-orientation";
import styled from "styled-components/native";
import { fontFamily } from "../theme/typography";

// Fullscreen media viewer: pinch to zoom, drag to pan, double-tap to
// toggle, swipe between items, swipe down to dismiss. Video items play
// with their own controls instead — a frozen first frame in a pinch-zoom
// viewer is worse than not opening at all.
//
// Written against gesture-handler's Gesture API with reanimated shared
// values. Two earlier attempts used the legacy PinchGestureHandler with
// RN's Animated, and under the New Architecture that never worked: Android
// never activated the pinch at all, and iOS zoomed but could not get back
// to fit. This is the combination the two libraries actually support
// together, and it behaves the same on both platforms.
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
// How far the photo has to fall before a downward drag counts as "close"
// rather than "I was looking at the bottom of it".
const DISMISS_DISTANCE = 120;

function clamp(value, min, max) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function ZoomablePage({
  uri,
  width,
  height,
  onZoomChange,
  onRequestClose,
  listRef,
}) {
  const scale = useSharedValue(1);
  // The scale and offset committed at the end of the last gesture. Every
  // gesture applies on top of these rather than to the live values, so
  // releasing and pinching again continues from where it stopped.
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const resetToFit = () => {
    "worklet";
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    runOnJS(onZoomChange)(false);
  };

  const pinch = Gesture.Pinch()
    // Declared against the pager so the horizontal scroll view does not
    // swallow the two-finger touch before this handler sees it.
    .simultaneousWithExternalGesture(listRef)
    .onUpdate((event) => {
      // A little give below 1 while the fingers are down, snapped back on
      // release, so pinching in feels elastic rather than stuck.
      scale.value = clamp(savedScale.value * event.scale, 0.85, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        resetToFit();
        return;
      }
      savedScale.value = scale.value;
      runOnJS(onZoomChange)(true);
    });

  const pan = Gesture.Pan()
    .maxPointers(2)
    .simultaneousWithExternalGesture(listRef)
    .onUpdate((event) => {
      // Unzoomed, the only drag that means anything is the downward one
      // that dismisses, so the photo follows on Y alone and the pager keeps
      // the horizontal axis.
      if (savedScale.value <= 1) {
        translateY.value = Math.max(0, event.translationY);
        return;
      }
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd((event) => {
      if (savedScale.value <= 1) {
        if (event.translationY > DISMISS_DISTANCE) {
          runOnJS(onRequestClose)();
          return;
        }
        translateY.value = withSpring(0);
        return;
      }
      // Only the part of the photo that overflows the screen can be dragged
      // into view, so the edges stop where the image ends instead of the
      // photo flying off and leaving a black frame.
      const overflowX = ((savedScale.value - 1) * width) / 2;
      const overflowY = ((savedScale.value - 1) * height) / 2;
      savedX.value = clamp(
        savedX.value + event.translationX,
        -overflowX,
        overflowX,
      );
      savedY.value = clamp(
        savedY.value + event.translationY,
        -overflowY,
        overflowY,
      );
      translateX.value = withSpring(savedX.value);
      translateY.value = withSpring(savedY.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        resetToFit();
        return;
      }
      savedScale.value = DOUBLE_TAP_SCALE;
      scale.value = withSpring(DOUBLE_TAP_SCALE);
      runOnJS(onZoomChange)(true);
    });

  // The double tap races the drag gestures so a quick two-tap is never read
  // as a tiny pan; pinch and pan run together, which is what lets you zoom
  // and reposition in one movement.
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View style={{ width, height }}>
        <Reanimated.Image
          source={{ uri }}
          resizeMode="contain"
          style={[{ width, height }, imageStyle]}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

function VideoPage({ uri, width, height }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    // Sound on — unlike the muted thumbnail on the detail screen, this one
    // was opened deliberately. Still mixWithOthers rather than an exclusive
    // session, which is what previously broke voice search on iOS.
    instance.audioMixingMode = "mixWithOthers";
    instance.play();
  });

  return (
    <LightboxVideo
      player={player}
      style={{ width, height }}
      contentFit="contain"
      nativeControls
    />
  );
}

export function ImageLightbox({ visible, media, startIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  // Handed to every page so its pinch and pan can be declared simultaneous
  // with the pager itself.
  const listRef = useRef(null);

  // The app is portrait-locked at startup; this is the one screen that
  // isn't. Turning the phone gives a landscape photo the full width of the
  // display instead of a letterboxed strip. The lock goes back on when the
  // viewer closes, including when it unmounts mid-rotation, so no other
  // screen inherits an orientation it was never laid out for.
  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => {});
    };
  }, []);

  if (!media?.length) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      // Fullscreen on Android means the photo, not the photo minus a bar.
      statusBarTranslucent
      // iOS only, and required there: a Modal keeps the orientation it was
      // presented in unless it is told which ones it accepts, so unlocking
      // alone would rotate the screen behind it and not the viewer.
      supportedOrientations={["portrait", "landscape"]}
    >
      <StatusBar hidden />
      {/* A Modal opens its own native view hierarchy, which the root
          GestureHandlerRootView in App.js does not reach into. Without this
          wrapper no gesture handler inside it ever activates — and because
          Pressables and scrolling keep working, it looks like only the
          pinch is broken. This is why three attempts at tuning the gesture
          itself changed nothing. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Backdrop>
          <FlatList
            ref={listRef}
            /* Paging offsets are pixel widths, so a rotation invalidates every
             one of them and leaves the list parked between two photos.
             Remounting on width and re-entering at the current index lands
             back on the same photo at the new size. */
            key={width}
            data={media}
            keyExtractor={(item, position) => `${item.uri}-${position}`}
            horizontal
            pagingEnabled
            // A zoomed photo owns the horizontal drag: without this, panning
            // left inside a zoomed image flicks to the next photo instead.
            scrollEnabled={!zoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, position) => ({
              length: width,
              offset: width * position,
              index: position,
            })}
            onMomentumScrollEnd={(event) =>
              setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item }) =>
              item.isVideo ? (
                <VideoPage uri={item.uri} width={width} height={height} />
              ) : (
                <ZoomablePage
                  uri={item.uri}
                  width={width}
                  height={height}
                  onZoomChange={setZoomed}
                  onRequestClose={onClose}
                  listRef={listRef}
                />
              )
            }
          />

          <CloseButton onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color="#ffffff" />
          </CloseButton>

          {media.length > 1 ? (
            <Counter>
              <CounterLabel>
                {index + 1} / {media.length}
              </CounterLabel>
            </Counter>
          ) : null}
        </Backdrop>
      </GestureHandlerRootView>
    </Modal>
  );
}

const LightboxVideo = styled(VideoView)``;

const Backdrop = styled.View`
  flex: 1;
  background-color: #000000;
`;

const CloseButton = styled(Pressable)`
  position: absolute;
  top: 48px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.16);
`;

const Counter = styled.View`
  position: absolute;
  top: 56px;
  left: 20px;
`;

const CounterLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
`;
