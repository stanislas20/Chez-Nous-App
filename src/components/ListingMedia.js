import { useEffect, useState } from "react";
import { useVideoPlayer, VideoView } from "expo-video";
// gesture-handler's ScrollView, not React Native's.
//
// The card is a Pressable, and RN's own responder system hands a touch that
// starts on a child straight to that Pressable — so a horizontal drag over
// the photo was being read as a press and OPENED the listing instead of
// paging. gesture-handler arbitrates between a native pan and the press
// instead of first-come-first-served, which is the whole reason the library
// is already wrapped around the app in App.js.
import { ScrollView } from "react-native-gesture-handler";
import { useIsFocused } from "@react-navigation/native";
import styled from "styled-components/native";
import { useI18n } from "../i18n/I18nContext";
import { getCategoryIcon, getCategoryLabel } from "../data/categories";
import { CategoryPlaceholder } from "./CategoryPlaceholder";
import { previewBufferOptions } from "../utils/videoPreview";
import {
  canDraw,
  drawableMedia,
  smallImageUri,
} from "../utils/listingImage";

// The picture area of a listing card, in one place.
//
// It answers three cases that were each being answered differently, or not
// at all, on six screens:
//
//   no photograph  — a placeholder naming the category, instead of the bare
//                    grey panel most cards were drawing
//   one photograph — the image
//   several        — swipeable in place, with dots, so somebody can look
//                    through a listing's photos without opening it. Only
//                    Pour vous' Recommended card could do this before, and
//                    it had its own copy of the logic.
//
// Page width comes from onLayout rather than a constant. The Recommended
// card could hardcode 168px because it is a fixed-width strip card; the
// grid cards are a percentage of the screen, so the only honest source for
// the page width is the measured one. Until it is measured the first photo
// renders full-bleed, which is what a single-photo card shows anyway.
//
// Videos are excluded: a video's poster frame is not renderable as a still
// here, and a page that is blank mid-swipe is worse than one fewer page.
// The cover image still shows them, because listing.mediaUrl is the
// thumbnail the upload flow produced.
// A muted, controls-free first frame — the same treatment ListingCard and
// AdCard each grew privately. It lives here now because this component is
// the picture area of a card, and a listing whose only media is a video was
// otherwise handed to <Image>, which renders a video URL as nothing at all:
// a blank panel with pager dots under it, which is exactly what an event
// posted with a video looked like.
//
// The player is created once, with no source, and the source is swapped in
// afterwards. `useVideoPlayer(uri, …)` is shorter and is what the rest of
// the app does, but it RELEASES the player the moment `uri` changes — and a
// card is reused for a different listing whenever a filter or a rail
// re-renders, which handed the still-mounted native view a dead player:
//
//   Cannot set prop 'player' on view 'class expo.modules.video.SurfaceVideoView'
//   → Caused by: Cannot use shared object that was already released
//
// Swapping the source leaves one player alive for as long as the view it
// belongs to, which is the only lifetime the native side agrees with.
function VideoFrame({ uri }) {
  // A screen pushed on top of this one does not unmount it: the whole stack
  // stays mounted underneath. Without this, every card left behind on Pour
  // vous and Local carries on decoding while you read something else.
  const isFocused = useIsFocused();
  const player = useVideoPlayer(null, (instance) => {
    instance.muted = true;
    // Never claim the iOS audio session for a silent preview — a held
    // playback session is what made voice search fail with
    // "Session activation failed" while thumbnails were on screen. Muted
    // and mixing, this can autoplay without taking audio from anything.
    instance.audioMixingMode = "mixWithOthers";
    // A card preview keeps a second or two of video, not the twenty
    // seconds expo-video buffers by default — see the note on
    // previewBufferOptions for the crash that came of the default.
    instance.bufferOptions = previewBufferOptions;
    // It plays, rather than sitting on its first frame.
    //
    // The code this grew out of was a *thumbnail* — a deliberate still. But
    // a still is what somebody who chose a video as their cover did not
    // choose: they picked motion, and got a photograph of its first frame,
    // which on a dark shot is often close to nothing at all.
    //
    // Looping, because a card that plays once and freezes is worse than
    // either a still or a loop — it looks broken exactly when somebody
    // scrolls back to it.
    instance.loop = true;
  });

  useEffect(() => {
    // `mounted` rather than firing blind: replaceAsync settles a tick or
    // two later, and by then this card may be gone and its player released
    // — calling play() on that throws the same shared-object error from the
    // other side.
    let mounted = true;
    try {
      player
        .replaceAsync(uri)
        .then(() => {
          if (mounted && isFocused) player.play();
        })
        .catch(() => {});
    } catch {
      // A player released between render and effect. Nothing to play.
    }
    return () => {
      mounted = false;
    };
  }, [player, uri, isFocused]);

  useEffect(() => {
    try {
      if (isFocused) player.play();
      else player.pause();
    } catch {
      // Released between render and effect.
    }
  }, [player, isFocused]);

  return <Video player={player} contentFit="cover" nativeControls={false} />;
}

export function ListingMedia({ listing, size = "card" }) {
  const { language } = useI18n();
  // Both dimensions, in pixels.
  //
  // The first version sized each page `width: measured, height: "100%"`, and
  // nothing scrolled: a horizontal ScrollView has no bounded height of its
  // own, so the percentage had nothing to resolve against and the pages came
  // out zero-high. The Recommended card works because it sizes its photos
  // with two absolute numbers — this now does the same, measured rather than
  // hardcoded because these cards are a percentage of the screen.
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState(0);

  const measure = (event) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) =>
      prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  };

  // Everything the seller uploaded, in the order they uploaded it.
  //
  // Videos used to be filtered out of this list and only shown when there
  // was nothing else. That quietly overrode the seller's own choice of
  // cover: somebody who uploaded a video first — deliberately, because the
  // first item is the cover — got their second photograph on the card and
  // the video nowhere. The order is theirs; each item is drawn according
  // to what it is.
  // The small copy where there is one — this component only ever draws
  // cards, thumbnails and rails, never the full-width hero.
  const cover = smallImageUri(listing);
  // Anything this platform cannot decode is dropped rather than drawn as a
  // grey rectangle — see the note on canDraw. A listing whose first photo
  // is a .heic shows its second, which is what somebody scrolling past
  // would have wanted anyway.
  const drawable = drawableMedia(listing.media);
  const items = drawable.length
    ? drawable
    : canDraw(cover)
      ? [{ mediaUrl: cover, mediaType: listing.mediaType }]
      : [];

  const isVideo = (item) => item?.mediaType === "video";

  if (items.length === 0) {
    return (
      <Fill>
        <CategoryPlaceholder
          icon={getCategoryIcon(listing.categoryKey)}
          label={getCategoryLabel(listing.categoryKey, language)}
          size={size}
        />
      </Fill>
    );
  }

  const measured = box.width > 0 && box.height > 0;

  if (items.length === 1) {
    return (
      <Fill onLayout={measure}>
        {isVideo(items[0]) ? (
          <VideoFrame uri={items[0].mediaUrl} />
        ) : (
          <Photo
            source={{ uri: smallImageUri(items[0]) }}
            resizeMode="cover"
          />
        )}
      </Fill>
    );
  }

  // Nothing until the first layout has been measured.
  //
  // This used to draw the first item full-bleed while waiting, which reads
  // well for a photograph and badly for a video: the throwaway frame
  // created a player and released it one commit later, which is exactly the
  // race the note on VideoFrame describes. One empty frame is cheaper.
  if (!measured) return <Fill onLayout={measure} />;

  return (
    <Fill onLayout={measure}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width: box.width, height: box.height }}
        onMomentumScrollEnd={(e) =>
          setActive(Math.round(e.nativeEvent.contentOffset.x / box.width))
        }
      >
        {items.map((item, index) =>
          isVideo(item) ? (
            <Page
              key={item.mediaPath ?? index}
              style={{ width: box.width, height: box.height }}
            >
              {/* Only the page in front of you gets a player. Every page of
                  every card is mounted at once — a listing with two videos
                  three cards down was decoding both, off screen, forever. */}
              {index === active ? (
                <VideoFrame uri={item.mediaUrl} />
              ) : (
                <VideoResting>
                  <VideoRestingGlyph>▶</VideoRestingGlyph>
                </VideoResting>
              )}
            </Page>
          ) : (
            <Photo
              key={item.mediaPath ?? index}
              source={{ uri: smallImageUri(item) }}
              resizeMode="cover"
              style={{ width: box.width, height: box.height }}
            />
          ),
        )}
      </ScrollView>
      <Dots pointerEvents="none">
        {items.map((_, index) => (
          <Dot key={index} active={index === active} />
        ))}
      </Dots>
    </Fill>
  );
}

const Fill = styled.View`
  width: 100%;
  height: 100%;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const Photo = styled.Image`
  width: 100%;
  height: 100%;
`;

// What a video page shows before you swipe to it.
const VideoResting = styled.View`
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  background-color: #101010;
`;

const VideoRestingGlyph = styled.Text`
  color: rgba(255, 255, 255, 0.82);
  font-size: 26px;
`;

const Video = styled(VideoView)`
  width: 100%;
  height: 100%;
`;

// A video page needs a box of the measured size for the player to fill;
// the player itself is 100% of it.
const Page = styled.View`
  overflow: hidden;
`;

// pointerEvents none on the row above, so the dots never swallow a swipe
// that was meant for the photo underneath them.
const Dots = styled.View`
  position: absolute;
  bottom: 7px;
  left: 0;
  right: 0;
  flex-direction: row;
  justify-content: center;
  gap: 3px;
`;

const Dot = styled.View`
  width: ${(props) => (props.active ? 14 : 5)}px;
  height: 5px;
  border-radius: 3px;
  background-color: ${(props) =>
    props.active ? "#ffffff" : "rgba(255, 255, 255, 0.55)"};
`;
