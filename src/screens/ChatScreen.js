import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Share,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ImageLightbox } from "../components/ImageLightbox";
import { PublicAvatar } from "../components/PublicAvatar";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { ensureCameraAccess } from "../utils/mediaAccess";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { downscalePickedAssets } from "../utils/downscalePhoto";
import { CHAT_MESSAGE_MAX } from "../data/listingLimits";
import { PRIVATE_UPLOAD_CACHE } from "../utils/uploadContentType";
import { useAuth } from "../auth/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { firestore, storage } from "../config/firebase";
import { useSellerStats } from "../hooks/useSellerStats";
import { reportNonFatal } from "../utils/reportError";

function PulsingRecordingDot() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <RecordingDot style={{ opacity: pulse }} />;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// How many messages arrive with the screen, and how many more each "load
// earlier" adds. Fifty is about four screens of bubbles on a phone — enough
// that opening a thread never shows a half-empty scroll, few enough that a
// long conversation opens as fast as a new one.
const MESSAGE_PAGE = 50;

const SCRUB_TRACK_WIDTH = 130;

// How close to the end still counts as "finished".
//
// Not zero, because the two numbers being compared come from different
// places. `effectiveDuration` prefers the length the RECORDER reported at
// stop, and the finalised m4a is routinely a few tens of milliseconds
// shorter than that — so `currentTime` plateaus just below the value it was
// being compared against, `currentTime >= effectiveDuration` never became
// true, and pressing play on a finished clip did nothing at all. The only
// way back to the start was to drag the bar there by hand.
//
// The cost is that pausing within this window and pressing play restarts
// instead of resuming. That is a fifth of a second at the very end of a
// clip, against a restart that never worked.
const END_EPSILON_SECONDS = 0.2;

// `status.duration` is deliberately not consulted here. It comes from the
// container metadata these clips often do not set correctly and can read as
// a large placeholder — the same reason effectiveDuration prefers the
// recorded length below. A placeholder would put the end out of reach and
// restore the bug this exists to fix.
function isAtEnd(status, effectiveDuration) {
  if (effectiveDuration > 0) {
    return status.currentTime >= effectiveDuration - END_EPSILON_SECONDS;
  }
  return Boolean(status.didJustFinish);
}

function VoiceMessageBubble({ uri, mine, knownDuration, played, onPlayed }) {
  const { colors } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const wasPlayingBeforeScrub = useRef(false);

  // The player's own `status.duration` comes from the audio file's container
  // metadata, which these locally-recorded m4a clips often don't have set
  // correctly (it can read as a large placeholder value). The duration we
  // tracked live while recording is trustworthy, so prefer that.
  const effectiveDuration = knownDuration || status.duration;

  const togglePlayback = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Awaited. seekTo returns a promise, and the old code fired it and
    // called play() on the next line — so even when the guard did fire,
    // playback could start against the old position before the seek landed.
    if (isAtEnd(status, effectiveDuration)) {
      await player.seekTo(0);
    }
    player.play();
  };

  // PanResponder is created once (via useRef) so its handlers close over
  // whatever `status`/`effectiveDuration`/`player` were at mount time. Route
  // through a ref that's kept in sync every render so the handlers always
  // see current values instead of stale ones.
  const latest = useRef({ status, effectiveDuration, player });
  latest.current = { status, effectiveDuration, player };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.effectiveDuration > 0,
      onPanResponderGrant: (evt) => {
        const { status: s, effectiveDuration: d, player: p } = latest.current;
        wasPlayingBeforeScrub.current = s.playing;
        if (s.playing) p.pause();
        if (d > 0)
          p.seekTo(
            Math.max(
              0,
              Math.min(1, evt.nativeEvent.locationX / SCRUB_TRACK_WIDTH),
            ) * d,
          );
      },
      onPanResponderMove: (evt) => {
        const { effectiveDuration: d, player: p } = latest.current;
        if (d > 0)
          p.seekTo(
            Math.max(
              0,
              Math.min(1, evt.nativeEvent.locationX / SCRUB_TRACK_WIDTH),
            ) * d,
          );
      },
      onPanResponderRelease: () => {
        if (wasPlayingBeforeScrub.current) latest.current.player.play();
      },
    }),
  ).current;

  // Heard, once the clip has actually reached its end — not on the first
  // tap of play. Somebody who starts a voice note and stops it two seconds
  // in has not listened to it, and marking it read there would make the
  // colour say something untrue about what they know.
  //
  // isAtEnd stays true once it is true, so this fires again on every status
  // tick until the screen records it; the guard is `played` rather than a
  // ref so a clip already marked on a previous visit never re-reports.
  // Marked on the first press of play, not on reaching the end.
  //
  // Waiting for the end is the more truthful claim, and it was what this did
  // first — but it reads as broken: a clip stopped a second early, or
  // scrubbed past its last moment, stays looking untouched, and the person
  // who just listened to it sees nothing change. The colour here answers
  // "which of these have I already dealt with", and starting one is enough
  // to answer that.
  //
  // status.playing rather than the press handler, so a clip started by any
  // route — the play button, a scrub that resumes — counts the same.
  useEffect(() => {
    if (played || !onPlayed) return;
    if (status.playing) onPlayed();
  }, [played, onPlayed, status.playing]);

  const progress =
    effectiveDuration > 0
      ? Math.min(1, status.currentTime / effectiveDuration)
      : 0;
  const displaySeconds =
    status.playing || status.currentTime > 0
      ? status.currentTime
      : effectiveDuration;

  return (
    <VoiceContainer>
      <Pressable onPress={togglePlayback} hitSlop={8}>
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={20}
          /* Heard clips take the accent. On a sent bubble the control is
             white on emerald and on a received one it is emerald on the
             surface, so the played state is one colour that has to read
             against both grounds — accent does, muted grey would look
             disabled rather than finished. */
          color={
            played
              ? colors.accent
              : mine
                ? colors.textInverse
                : colors.primary
          }
        />
      </Pressable>
      <VoiceTrackColumn>
        <ScrubTrack {...panResponder.panHandlers}>
          <ScrubTrackBg mine={mine} />
          <ScrubTrackFill
            mine={mine}
            played={played}
            style={{ width: `${progress * 100}%` }}
          />
          <ScrubThumb
            mine={mine}
            played={played}
            style={{ left: `${progress * 100}%` }}
          />
        </ScrubTrack>
        <VoiceDuration mine={mine}>
          {formatDuration(displaySeconds)}
        </VoiceDuration>
      </VoiceTrackColumn>
    </VoiceContainer>
  );
}

// ── What a message IS ──────────────────────────────────────────────────
//
// There is no `type` field on a message document and there never was: a
// photo is a message carrying imageUrl, a voice note carries audioUrl, and
// everything else is text. That worked while rendering was the only thing
// asking, and it stops working once five actions each need a different
// answer. So the question is asked in one place instead of re-derived at
// every call site with a slightly different ternary.
//
// A tombstone is checked FIRST and reported as its own kind. Its payload
// fields are gone, so without this it would answer "text" and offer Copy and
// Edit on a message that no longer has anything to copy or edit.
const MESSAGE_DELETED = "deleted";
const MESSAGE_TEXT = "text";
const MESSAGE_IMAGE = "image";
const MESSAGE_AUDIO = "audio";

function messageKind(message) {
if (message?.deleted === true) return MESSAGE_DELETED;
if (message?.imageUrl) return MESSAGE_IMAGE;
if (message?.audioUrl) return MESSAGE_AUDIO;
return MESSAGE_TEXT;
}

// The longest quote a reply carries. Long enough to recognise which message
// is meant, short enough that it cannot become a second message body
// smuggled past the composer's own limit — firestore.rules enforces the same
// number, because this one is a courtesy and that one is the control.
const REPLY_PREVIEW_MAX = 120;

// Which actions a given message offers, to whoever is looking at it.
//
// Returned as data rather than rendered inline, because "can this be edited"
// is a rule about the message and the viewer, and a rule that lives inside
// JSX cannot be tested without a renderer. The sheet below maps this to rows;
// scripts/check-message-actions.js drives it directly.
//
// The security note this file must not forget: this decides what is OFFERED,
// never what is PERMITTED. Firestore rules refuse an edit or a tombstone from
// anyone but the sender regardless of what these booleans say, which is the
// property the rules tests assert against the real engine.
// The immutable quote a reply carries.
//
// A snapshot rather than a pointer, so the quote renders with no second read
// — at fifty messages a live lookup per reply is fifty reads on every open —
// and so it survives the original being edited or deleted. A quote that
// vanishes when the quoted message does takes the reply's meaning with it.
//
// Deliberately four fields. No download URL (it carries a Storage access
// token), no display name (it goes stale and belongs to the profile), no
// timestamp, nothing about the sender beyond their uid.
function replySnapshot(message) {
  const kind = messageKind(message);
  return {
    messageId: message.id,
    senderId: message.senderId,
    type: kind === MESSAGE_DELETED ? MESSAGE_TEXT : kind,
    textPreview:
      kind === MESSAGE_TEXT && typeof message.text === "string"
        ? message.text.slice(0, REPLY_PREVIEW_MAX)
        : null,
  };
}

function actionsFor(message, viewerUid) {
const kind = messageKind(message);
const mine = Boolean(viewerUid) && message?.senderId === viewerUid;
if (kind === MESSAGE_DELETED) {
  // Nothing to quote, copy, share, edit or delete. The sheet does not open.
  return { reply: false, copy: false, share: false, edit: false, remove: false };
}
const isText = kind === MESSAGE_TEXT;
const hasText = isText && typeof message?.text === "string" && message.text.trim().length > 0;
return {
  reply: true,
  // Text only, and only when there is text to put on the clipboard.
  copy: hasText,
  // Text only for this release. The sole shareable representation of a
  // photo or a voice note is its Firebase download URL, which carries an
  // access token — putting that into WhatsApp hands out a credential, so
  // media Share is deliberately absent rather than half-implemented.
  share: hasText,
  edit: mine && hasText,
  remove: mine,
};
}

// ── Reconciling the historical pages ───────────────────────────────────
//
// The bounds of what is currently loaded. Null when there is nothing to
// check, or when any page still carries an unresolved serverTimestamp — a
// range that cannot be stated cannot be verified, and it resolves before the
// next focus anyway.
function reconcileWindow(loaded) {
  if (!loaded.length) return null;
  const times = loaded.map((m) => m.createdAt);
  if (times.some((t) => typeof t?.toMillis !== "function")) return null;
  let oldest = times[0];
  let newest = times[0];
  for (const t of times) {
    if (t.toMillis() < oldest.toMillis()) oldest = t;
    if (t.toMillis() > newest.toMillis()) newest = t;
  }
  return { oldest, newest, lo: oldest.toMillis(), hi: newest.toMillis() };
}

// Whether a message survives a reconciliation result.
//
// The subtle half of the fix. `alive` lists the ids the server still has
// INSIDE the window that was checked — and by the time it arrives, the user
// may have loaded another page, whose messages are older than that window and
// therefore absent from `alive` through no fault of their own. Filtering on
// `alive.has(id)` alone deletes the page they just pulled in, which looks
// exactly like losing data.
//
// So the window is part of the predicate: only a message that was inside the
// range this result speaks for may be judged by it.
function survivesReconcile(message, lo, hi, alive) {
  const at = message?.createdAt?.toMillis?.();
  // Unresolved timestamp: not placeable in any window, so never removed by one.
  if (typeof at !== "number") return true;
  if (at < lo || at > hi) return true;
  return alive.has(message.id);
}

// One cycle. Returns a word for what it did, which is what the tests read.
//
// The in-flight guard is a ref rather than state: `appActive` comes from an
// AppState listener and `isFocused` from navigation, two independent sources
// that can flip in separate commits for one real transition — resuming the
// app onto this screen. Without the guard that is two effect runs and two
// count queries, and with a stale predicate it was also two filters racing.
// Reset in `finally`, so a thrown request cannot leave the screen unable to
// reconcile for the rest of its life.
async function reconcileLoadedHistory({
  loaded,
  inFlightRef,
  collectionRef,
  api,
  applySurvivors,
  onError,
}) {
  if (inFlightRef.current) return "busy";
  const window = reconcileWindow(loaded);
  if (!window) return "nothing-to-do";

  inFlightRef.current = true;
  try {
    const { query, where, orderBy, getCountFromServer, getDocs } = api;
    const range = [
      where("createdAt", ">=", window.oldest),
      where("createdAt", "<=", window.newest),
    ];
    // The cheap question first. A new message cannot land inside a historical
    // range — it is newer than every document in one — so a count that has
    // fallen can only mean a deletion, and an unchanged count means there is
    // nothing to re-read. One read per focus, whatever the range holds.
    const counted = await getCountFromServer(query(collectionRef, ...range));
    if (counted.data().count === loaded.length) return "unchanged";

    const snapshot = await getDocs(
      query(collectionRef, ...range, orderBy("createdAt", "desc")),
    );
    const alive = new Set(snapshot.docs.map((d) => d.id));
    applySurvivors(window.lo, window.hi, alive);
    return "reconciled";
  } catch (error) {
    // A failed reconcile leaves the stale copy on screen rather than clearing
    // the thread. Reported, and retried on the next focus.
    onError(error);
    return "failed";
  } finally {
    inFlightRef.current = false;
  }
}

export function ChatScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { conversationId, listingTitle, attachOnOpen } = route.params;

  // Which voice notes this device has heard to the end.
  //
  // Held by the SCREEN, not by the bubble: FlatList recycles rows, so a
  // colour kept inside VoiceMessageBubble would reset the moment the clip
  // scrolled out of view and the row was handed to another message.
  //
  // Per device, and deliberately so. It says "you have heard this", which is
  // a fact about this phone — telling the SENDER their clip was heard is a
  // different feature and cannot be done from here, because it would mean
  // the listener writing the sender's message document.
  const playedKey = `chat:played:${conversationId}`;
  const [playedAudio, setPlayedAudio] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(playedKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const ids = JSON.parse(raw);
        if (Array.isArray(ids)) setPlayedAudio(new Set(ids));
      })
      // Storage that cannot be read is a colour that does not appear. The
      // conversation still works, so this is never allowed to throw.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [playedKey]);

  const markAudioPlayed = useCallback(
    (messageId) => {
      setPlayedAudio((previous) => {
        if (!messageId || previous.has(messageId)) return previous;
        const next = new Set(previous).add(messageId);
        AsyncStorage.setItem(playedKey, JSON.stringify([...next])).catch(
          () => {},
        );
        return next;
      });
    },
    [playedKey],
  );
  const { t, language } = useI18n();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState(null);
  // The newest page, held live. Never grows.
  const [liveMessages, setLiveMessages] = useState(null);
  // Pages fetched behind it, once each, never re-read.
  const [olderMessages, setOlderMessages] = useState([]);
  // Mirrored into a ref so the focus reconciler can read what is loaded
  // without taking olderMessages as a dependency — which would rebuild the
  // callback on every page load and re-fire the effect that uses it.
  const olderMessagesRef = useRef([]);
  useEffect(() => {
    olderMessagesRef.current = olderMessages;
  }, [olderMessages]);
  const oldestLoadedRef = useRef(null);
  const [hasEarlier, setHasEarlier] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedClip, setRecordedClip] = useState(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);

  // Playing a voice message needs the session configured, and until now only
  // RECORDING one ever configured it.
  //
  // setAudioModeAsync was called in three places, all of them recording
  // handlers. Somebody who only ever receives audio never called it, so
  // expo-audio never called setCategory at all and the session stayed on the
  // iOS app default — soloAmbient, which the hardware ring switch mutes.
  // The bubble played: the bar moved, the timer counted, and no sound came
  // out. The sender heard their own preview perfectly, because
  // handleStopRecording had just set playsInSilentMode for them, so the two
  // ends disagreed about whether the clip had any audio in it.
  //
  // On mount rather than inside togglePlayback: the scrub handler calls
  // play() too on release, and a fix that only covered the play button
  // would leave that path silent.
  //
  // playsInSilentMode with allowsRecording false resolves to .playback, and
  // the default mixWithOthers keeps somebody's music going — opening a
  // conversation should not stop it. iOS only; the flag is a no-op on
  // Android, where media volume already governs this.
  useEffect(() => {
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
      () => {
        // A session the OS refuses to reconfigure is not worth an alert in
        // front of a conversation — playback is degraded, not broken, and
        // the recording handlers try again on their own path.
      },
    );
  }, []);

  const otherUid = conversation?.participantIds?.find((id) => id !== user?.uid);
  const otherName = conversation?.participantNames?.[otherUid] ?? null;
  // Reputation of the person you are talking to, shown where the decision
  // to trust them is actually made.
  const otherStats = useSellerStats(otherUid);

  // The one route to a buyer's profile in the app. Every other way in
  // starts from a listing, so it can only ever reach a seller — which is
  // why the ratings model was symmetric but only sellers were ever rated.
  const openOtherProfile = () => {
    if (!otherUid) return;
    navigation.navigate("SellerProfile", {
      sellerId: otherUid,
      sellerName: otherName ?? t("chatUnknownParticipant"),
      // An instant-render hint, nothing more. This screen already holds the
      // other participant's public projection, so handing it over saves the
      // profile a frame of showing an initial while its own subscription
      // arrives. SellerProfileScreen does NOT depend on it: it falls back to
      // stats?.photoUrl, which is what makes a profile opened from anywhere
      // else correct too.
      sellerPhotoUrl: otherStats?.photoUrl ?? null,
    });
  };
  // When the other participant last opened this conversation, in ms.
  //
  // Everything at or before this instant has been in front of them; anything
  // after it has not. That is the whole read-receipt model — a comparison,
  // not a flag stored per message.
  //
  // Null until they have ever opened the thread, which is the honest state
  // for a conversation nobody has read yet, and is why the fallback below is
  // -1 rather than 0: a message whose own timestamp has not resolved yet
  // must not come out equal to an unread threshold and render as read.
  const otherLastReadMillis =
    otherUid && conversation?.lastReadAt?.[otherUid]?.toMillis
      ? conversation.lastReadAt[otherUid].toMillis()
      : null;

  // Three states, and only two of them are ever shown as ticks.
  //
  // `createdAt` is a serverTimestamp, so it is null on the sender's own
  // screen for the moment between the optimistic write and the server's
  // acknowledgement. That message is in flight: it has not been stored, so
  // claiming "sent" would be premature and claiming "read" would be false.
  // It gets the pending clock instead.
  //
  // What is deliberately NOT here is a "delivered" state. Nothing in this
  // app reports that a message reached the other handset — there is no
  // delivery acknowledgement to read — so a second grey tick would be
  // decoration that asserts something we have not observed. Two states that
  // are true beat three where one is invented.
  const readStateFor = (message) => {
    const createdMillis = message.createdAt?.toMillis
      ? message.createdAt.toMillis()
      : null;
    if (createdMillis === null) return "pending";
    if (otherLastReadMillis !== null && createdMillis <= otherLastReadMillis) {
      return "read";
    }
    return "sent";
  };

  // ── Chronology ────────────────────────────────────────────────────────
  //
  // A conversation had no time on it anywhere. The list outside showed
  // "3:27 AM"; inside, a thread running over four days was an undifferentiated
  // column of bubbles, and there was no way to tell a reply sent a minute ago
  // from one sent last Tuesday.
  //
  // Two devices, both platforms, same absence — so this is not a rendering
  // accident, it was never built.
  //
  // Restraint matters as much as the information. A timestamp welded to every
  // bubble turns a fast back-and-forth into a wall of repeated numbers, so a
  // run of messages from one sender inside a few minutes carries ONE time, on
  // its last line, and the day is announced once by a separator rather than
  // repeated on each message.
  const messageLocale = language === "en" ? "en-GB" : "fr-FR";

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(messageLocale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [messageLocale],
  );

  const dayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(messageLocale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [messageLocale],
  );

  // A run ends when the next NEWER message is from somebody else, or far
  // enough away in time that the two were not part of one exchange.
  const GROUP_WINDOW_MS = 5 * 60 * 1000;

  const dayKeyOf = (date) =>
    date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : null;

  const dateOf = (message) => message?.createdAt?.toDate?.() ?? null;

  const separatorLabelFor = (date) => {
    const today = new Date();
    if (dayKeyOf(date) === dayKeyOf(today)) return t("chatDateToday");
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (dayKeyOf(date) === dayKeyOf(yesterday)) return t("chatDateYesterday");
    return dayFormatter.format(date);
  };

  const iBlocked = Boolean(user && conversation?.blockedBy?.[user.uid]);
  const blockedByOther = Boolean(
    otherUid && conversation?.blockedBy?.[otherUid],
  );
  const isBlocked = iBlocked || blockedByOther;

  const handleBlockToggle = () => {
    if (!user) return;
    if (iBlocked) {
      // Reported and surfaced, not swallowed. A block that silently failed
      // left the UI saying "unblocked" while the write never landed — and
      // for the blocking pair specifically, the screen and the server
      // disagreeing about who may message whom is a safety question rather
      // than a cosmetic one.
      updateDoc(doc(firestore, "conversations", conversationId), {
        [`blockedBy.${user.uid}`]: false,
      }).catch((error) => {
        reportNonFatal("chatUnblock", error, { where: "ChatScreen" });
        Alert.alert(t("errorTitle"), t("blockUpdateFailed"));
      });
      return;
    }
    Alert.alert(t("chatBlockConfirmTitle"), t("chatBlockConfirmMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("chatBlockUser"),
        style: "destructive",
        onPress: () => {
          updateDoc(doc(firestore, "conversations", conversationId), {
            [`blockedBy.${user.uid}`]: true,
          }).catch((error) => {
            reportNonFatal("chatBlock", error, { where: "ChatScreen" });
            Alert.alert(t("errorTitle"), t("blockUpdateFailed"));
          });
        },
      },
    ]);
  };

  const handleOpenMenu = () => {
    Alert.alert(t("chatMenuOptions"), undefined, [
      {
        text: iBlocked ? t("chatUnblockUser") : t("chatBlockUser"),
        style: iBlocked ? "default" : "destructive",
        onPress: handleBlockToggle,
      },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: listingTitle,
      headerRight: () => (
        <Pressable
          onPress={handleOpenMenu}
          hitSlop={12}
          style={{ marginRight: spacing.md }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, listingTitle, iBlocked]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(firestore, "conversations", conversationId),
      (snapshot) => {
        setConversation(
          snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
        );
      },
    );
    return unsubscribe;
  }, [conversationId]);

  // The newest page, live. Older pages, fetched once each.
  //
  // ── What this replaces, and why the old reasoning was wrong ───────────
  //
  // This used to be one listener with a growing limit: "load earlier" added
  // fifty to the window and the query re-subscribed. The comment here argued
  // that this was the better shape because Firestore owns ordering, identity
  // and removals, and claimed the re-read was free — "Firestore serves the
  // documents it already holds from cache, so the billed part is the fifty
  // newly revealed ones".
  //
  // That last sentence is false, and the independent audit measured it. A
  // changed limit is a DIFFERENT query, so it is a new listener and a new
  // server-side read of the whole window. Reaching two thousand messages
  // through forty taps cost 50 + 100 + … + 2000 = 41,000 document reads to
  // display 2,000 messages, and ten thousand cost slightly over a million.
  // The final listener then watched all of them, live, for the rest of the
  // session.
  //
  // So: two sources, and the merge problems the old comment listed are real
  // and are handled below rather than avoided.
  //
  //   live    onSnapshot over the newest MESSAGE_PAGE. Fixed size, forever.
  //           New messages, edits and deletions in the recent part of the
  //           thread all arrive here, which is the part where they happen.
  //
  //   older   getDocs, one page at a time, startAfter the oldest document
  //           already held. Read once and kept. Never watched again.
  //
  // Reaching two thousand messages now costs 2,000 reads instead of 41,000,
  // and the live listener stays at fifty documents however far back somebody
  // scrolls.
  //
  // The boundary, stated rather than hidden: a message deleted after it has
  // scrolled into the historical part stays on screen until the thread is
  // reopened. Deleting your own message minutes after sending it — which is
  // when people actually do it — happens inside the live window and
  // disappears immediately.
  useEffect(() => {
    const messagesQuery = query(
      collection(firestore, "conversations", conversationId, "messages"),
      orderBy("createdAt", "desc"),
      limit(MESSAGE_PAGE),
    );
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        setLiveMessages(
          snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
        );
        // The cursor for the first "load earlier", and the answer to whether
        // there is one: fewer documents than a page means this thread is
        // shorter than a page.
        if (oldestLoadedRef.current === null) {
          oldestLoadedRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
          setHasEarlier(snapshot.docs.length >= MESSAGE_PAGE);
        }
        setLoadingEarlier(false);
      },
      () => {
        // Distinguished from an empty thread. An error that renders as "no
        // messages" is the same lie as a search that renders as "no results".
        setLiveMessages([]);
        setLoadFailed(true);
        setLoadingEarlier(false);
      },
    );
    return unsubscribe;
  }, [conversationId]);

  // Reset when the thread changes, or a long scroll back through one
  // conversation would be inherited by the next one opened.
  useEffect(() => {
    setLiveMessages(null);
    setOlderMessages([]);
    oldestLoadedRef.current = null;
    setHasEarlier(true);
    setLoadFailed(false);
  }, [conversationId]);

  // One page back, read once, kept. The cursor is the oldest document held,
  // so pages never overlap and nothing is read twice.
  const loadEarlierMessages = useCallback(async () => {
    if (loadingEarlier || !hasEarlier) return;
    const cursor = oldestLoadedRef.current;
    if (!cursor) return;
    setLoadingEarlier(true);
    try {
      const snapshot = await getDocs(
        query(
          collection(firestore, "conversations", conversationId, "messages"),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(MESSAGE_PAGE),
        ),
      );
      const page = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (snapshot.docs.length) {
        oldestLoadedRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
      setOlderMessages((current) => {
        // Dedupe across the seam: a message written between the live
        // snapshot and this fetch can appear in both.
        const seen = new Set(current.map((m) => m.id));
        return [...current, ...page.filter((m) => !seen.has(m.id))];
      });
      setHasEarlier(snapshot.docs.length >= MESSAGE_PAGE);
    } catch (error) {
      setHasEarlier(false);
      reportNonFatal("chatLoadEarlier", error, { where: "ChatScreen" });
    } finally {
      setLoadingEarlier(false);
    }
  }, [conversationId, loadingEarlier, hasEarlier]);

  // What the list renders: the live page in front, history behind, ids
  // deduped, order owned by createdAt so the seam cannot show a gap or a
  // repeat.
  useEffect(() => {
    if (liveMessages === null) {
      setMessages(null);
      return;
    }
    const byId = new Map();
    for (const m of [...liveMessages, ...olderMessages]) {
      if (!byId.has(m.id)) byId.set(m.id, m);
    }
    const merged = [...byId.values()].sort((a, b) => {
      const at = a.createdAt?.toMillis?.() ?? 0;
      const bt = b.createdAt?.toMillis?.() ?? 0;
      return bt - at;
    });
    setMessages(merged);
  }, [liveMessages, olderMessages]);

  // Whether the app itself is in the foreground. Navigation focus is not
  // enough on its own: a backgrounded app keeps this screen "focused" and
  // keeps its Firestore listener running, so without this a message arriving
  // while the phone is in somebody's pocket would be marked read and its
  // badge lost before they ever saw it.
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setAppActive(next === "active");
    });
    return () => subscription.remove();
  }, []);

  // An image the sender has chosen and not yet sent. Local file:// only —
  // nothing is uploaded while this is set.
  const [pendingImage, setPendingImage] = useState(null);

  // The image message currently open full screen, or null.
  const [lightboxUri, setLightboxUri] = useState(null);

  const isFocused = useIsFocused();

  // The newest message that somebody ELSE sent. Messages are held newest
  // first, so the first match is the latest one.
  //
  // This is the dependency that makes the reset below fire again, and it is
  // deliberately this rather than the message list: it changes only when a
  // message ARRIVES FROM THE OTHER PARTICIPANT, so sending, re-rendering, a
  // read receipt, a changed unread count or any other conversation write
  // does not trigger a write of its own. Comparing ids rather than counts
  // also survives a deletion without re-firing.
  // `messages` starts as null while the first page loads, so it is checked
  // rather than assumed — reading .find off it is a crash on first render.
  const latestIncomingId =
    user && messages
      ? messages.find((message) => message.senderId !== user.uid)?.id
      : undefined;

  useEffect(() => {
    if (!user) return;
    // Only while the reader is actually looking at this conversation.
    if (!isFocused || !appActive) return;
    // No alert: a failed reset shows a stale badge, which is confusing
    // rather than unsafe. It is reported so a systematic failure is visible
    // in Crashlytics instead of only in everybody's badge count.
    // lastReadAt rides along on the write that was already happening.
    //
    // It is what the OTHER participant's ticks are read from, and pairing it
    // with the unread reset is deliberate: the two can never disagree about
    // whether this conversation has been read, because they are one write.
    // A separate write would have introduced a state where the badge is
    // cleared and the sender still sees one tick, or the reverse.
    //
    // One field on one document, not a readAt stamped on every message.
    // Opening a thread with four hundred messages in it costs the same
    // single write as opening an empty one, and the sender's side needs no
    // per-message fan-out to render — it compares timestamps.
    updateDoc(doc(firestore, "conversations", conversationId), {
      [`unreadCount.${user.uid}`]: 0,
      [`lastReadAt.${user.uid}`]: serverTimestamp(),
    }).catch((error) => {
      reportNonFatal("chatUnreadReset", error, { where: "ChatScreen" });
    });
    // latestIncomingId is what re-runs this when a message arrives while the
    // screen is already open — the case the original dependency list missed,
    // where the message was rendered in front of the reader and the badge
    // stayed on the conversation they were reading.
  }, [conversationId, user, latestIncomingId, isFocused, appActive]);

  const updateLastMessage = async ({ messageId, messageType, preview }) => {
    const otherParticipant = conversation.participantIds.find(
      (id) => id !== user.uid,
    );
    await updateDoc(doc(firestore, "conversations", conversationId), {
      lastMessage: preview ?? null,
      lastMessageType: messageType,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: user.uid,
      // New. Editing or deleting a message has to know whether it is the one
      // the conversation list is showing, and until now nothing on the thread
      // said which message that was.
      lastMessageId: messageId ?? null,
      [`unreadCount.${otherParticipant}`]: increment(1),
    });
  };

  // ── Historical pages, reconciled on focus ──────────────────────────────
  //
  // The live window looks after itself: a deleted document simply stops
  // appearing in the snapshot. Older pages cannot, because they are read once
  // with getDocs and never watched again — so a message the other person
  // deletes while you are scrolled back stays on your screen until the thread
  // is remounted. For a delete feature whose whole promise is that the
  // content is gone, "until you reopen it" is not good enough.
  //
  // A listener per loaded page would fix it and is the wrong price: five
  // pages back is five permanent listeners on a screen people leave open.
  //
  // So it is reconciled when the conversation comes back to the foreground,
  // over exactly the range already loaded, and the common case is made cheap
  // by asking a question with a one-read answer first:
  //
  //   count(loaded range)  ==  what we hold   ->  nothing was deleted, stop
  //   count differs                           ->  re-read the range, drop
  //                                               whatever no longer exists
  //
  // New messages cannot land inside a historical range — they are newer than
  // every document in it — so a count that has fallen can only mean deletion.
  // That makes one aggregation read a sufficient test.
  //
  // READ COST. Nothing deleted: ONE read per focus, whatever the range holds,
  // because getCountFromServer bills one read per 1000 documents counted.
  // After a deletion: that one, plus one per surviving document in the loaded
  // range — so for P loaded pages of MESSAGE_PAGE, at most 1 + P*50, and only
  // on the focus that follows a deletion.
  // One cycle at a time. See reconcileLoadedHistory for why this is a ref.
  const reconcileInFlightRef = useRef(false);

  const reconcileOlderMessages = useCallback(
    () =>
      reconcileLoadedHistory({
        loaded: olderMessagesRef.current,
        inFlightRef: reconcileInFlightRef,
        collectionRef: collection(
          firestore,
          "conversations",
          conversationId,
          "messages",
        ),
        api: { query, where, orderBy, getCountFromServer, getDocs },
        applySurvivors: (lo, hi, alive) =>
          setOlderMessages((current) =>
            current.filter((m) => survivesReconcile(m, lo, hi, alive)),
          ),
        onError: (error) =>
          reportNonFatal("chatReconcileOlder", error, { where: "ChatScreen" }),
      }),
    [conversationId],
  );

  // On focus and on return from the background — the two moments a reader
  // comes back to a thread they had scrolled back through. Nothing else may
  // trigger a cycle: sending, editing, loading another page and ordinary
  // rerenders all leave these two booleans alone, and the callback is stable
  // across renders so the effect does not re-fire on its own.
  useEffect(() => {
    if (!isFocused || !appActive) return;
    reconcileOlderMessages();
  }, [isFocused, appActive, reconcileOlderMessages]);

  // ── Keeping the conversation list honest ───────────────────────────────
  //
  // Editing or deleting the newest message has to be reflected on the thread
  // document, or the inbox goes on showing text that no longer exists — which
  // for a deleted message is the whole point of deleting it.
  //
  // The test is identity, not time. Comparing createdAt to lastMessageAt
  // looks equivalent and races: between reading the thread and writing the
  // repair the other person can send, and a timestamp comparison would then
  // overwrite THEIR newer preview with the repair for an older message.
  //
  // LEGACY THREADS: conversations whose newest message predates lastMessageId
  // have none, and nothing is backfilled. For those the repair is SKIPPED
  // rather than guessed — a briefly stale inbox row is a smaller fault than
  // one that clobbers a newer message's preview, and it corrects itself the
  // moment either person sends anything.
  const messagesRef = () =>
    collection(firestore, "conversations", conversationId, "messages");

  const previewFieldsFor = (docSnap) => {
    const m = docSnap.data();
    return {
      lastMessage: m.text ?? null,
      lastMessageType: m.imageUrl ? "image" : m.audioUrl ? "audio" : "text",
      lastMessageId: docSnap.id,
      lastMessageSenderId: m.senderId ?? null,
      lastMessageAt: m.createdAt ?? null,
    };
  };

  // An edit only changes what the row SAYS. Same message, same moment, same
  // sender, already counted — so lastMessageAt, lastMessageSenderId and
  // unreadCount are deliberately untouched.
  const repairPreviewAfterEdit = async (message, nextText) => {
    if (!message?.id || !conversation) return;
    if (conversation.lastMessageId !== message.id) return;
    try {
      await updateDoc(doc(firestore, "conversations", conversationId), {
        lastMessage: nextText ?? null,
        lastMessageType: "text",
      });
    } catch (error) {
      reportNonFatal("chatRepairPreview", error, { where: "ChatScreen" });
    }
  };

  // A delete is different: the message is gone, so the row has to move to
  // whatever is now newest. One bounded read — limit(1) — and only when the
  // deleted message was the one on display.
  const repairPreviewAfterDelete = async (message) => {
    if (!message?.id || !conversation) return;
    if (conversation.lastMessageId !== message.id) return;
    try {
      const newest = await getDocs(
        query(messagesRef(), orderBy("createdAt", "desc"), limit(1)),
      );
      const convRef = doc(firestore, "conversations", conversationId);
      if (newest.empty) {
        // The thread still exists and still belongs in the inbox, so
        // lastMessageAt is left alone: zeroing it would drop the row to the
        // bottom of a list ordered by it, which is a different event from
        // "the last message was deleted".
        await updateDoc(convRef, {
          lastMessage: null,
          lastMessageType: null,
          lastMessageId: null,
        });
        return;
      }
      // If somebody sent between the delete and this read, limit(1) returns
      // THEIR message and the row correctly shows it. That is the race the
      // identity check above cannot cover, and it resolves the right way.
      await updateDoc(convRef, previewFieldsFor(newest.docs[0]));
    } catch (error) {
      reportNonFatal("chatRepairPreview", error, { where: "ChatScreen" });
    }
  };

  // ── The long-press sheet ───────────────────────────────────────────────
  //
  // One piece of state, holding the message whose actions are open. Null is
  // closed. The alternative — a boolean plus a separate "which message" —
  // can disagree with itself, and an action sheet that is open against the
  // wrong message deletes the wrong message.
  const [actionMessage, setActionMessage] = useState(null);
  // What the composer is doing: quoting something, or rewriting something.
  // Mutually exclusive by construction, because both own the same text box.
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  // A clipboard write is invisible, so Copy says so. Cleared on a timer that
  // is cancelled on unmount, because a setState after the screen is gone is
  // the classic way a toast outlives its screen.
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const closeActions = () => setActionMessage(null);

  const openActions = (message) => {
    // A tombstone has no actions, so it has no sheet. Opening an empty sheet
    // on a long press reads as a bug rather than as "there is nothing here".
    if (messageKind(message) === MESSAGE_DELETED) return;
    setActionMessage(message);
  };

  // The sheet's rows, from the single source of truth for visibility. Built
  // here rather than inline in JSX so the sheet renders a list and nothing
  // decides eligibility twice.
  const sheetActions = actionsFor(actionMessage, user?.uid);
  const actionRows = [
    sheetActions.reply && {
      key: "reply",
      icon: "arrow-undo-outline",
      label: t("chatActionReply"),
      onPress: () => handleReply(actionMessage),
    },
    sheetActions.copy && {
      key: "copy",
      icon: "copy-outline",
      label: t("chatActionCopy"),
      onPress: () => handleCopy(actionMessage),
    },
    sheetActions.share && {
      key: "share",
      icon: "share-outline",
      label: t("chatActionShare"),
      onPress: () => handleShare(actionMessage),
    },
    sheetActions.edit && {
      key: "edit",
      icon: "create-outline",
      label: t("chatActionEdit"),
      onPress: () => handleStartEdit(actionMessage),
    },
    sheetActions.remove && {
      key: "delete",
      icon: "trash-outline",
      label: t("chatDelete"),
      destructive: true,
      onPress: () => handleDeleteMessage(actionMessage),
    },
  ].filter(Boolean);

  const handleReply = (message) => {
    closeActions();
    // Quoting and editing both own the composer; starting one cancels the
    // other rather than leaving the text box claimed by two things at once.
    setEditingMessage(null);
    setReplyingTo(message);
  };

  const handleCopy = async (message) => {
    closeActions();
    const value = typeof message?.text === "string" ? message.text : "";
    if (!value) return;
    try {
      // The visible text and nothing else — no id, no sender, no timestamp.
      await Clipboard.setStringAsync(value);
      setToast(t("messageCopied"));
    } catch (error) {
      reportNonFatal("chatCopyMessage", error, { where: "ChatScreen" });
    }
  };

  const handleShare = async (message) => {
    closeActions();
    const value = typeof message?.text === "string" ? message.text : "";
    if (!value) return;
    try {
      // The message text alone. Not the document id, not the sender uid, and
      // for media not the download URL — that carries a Storage access token,
      // which is why Share is offered for text only in this release.
      await Share.share({ message: value });
    } catch {
      // Dismissing the share sheet rejects on some platforms. Not an error.
    }
  };

  const handleStartEdit = (message) => {
    closeActions();
    setReplyingTo(null);
    setEditingMessage(message);
    setText(typeof message?.text === "string" ? message.text : "");
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setText("");
  };

  const handleSaveEdit = async () => {
    const message = editingMessage;
    const next = text.trim();
    if (!message || !next) return;
    // Nothing changed: close, and do not spend a write stamping editedAt on
    // a message whose text is identical.
    if (next === message.text) {
      cancelEdit();
      return;
    }
    setEditingMessage(null);
    setText("");
    try {
      // Same document, so the id, senderId, createdAt, replyTo, ordering and
      // both read receipts are untouched. sendMessagePush is onDocumentCreated,
      // so this fires no notification, and unreadCount is only ever
      // incremented by updateLastMessage on a send — which is why editing
      // cannot re-notify or re-unread anybody without new code to do it.
      await updateDoc(
        doc(firestore, "conversations", conversationId, "messages", message.id),
        { text: next, editedAt: serverTimestamp() },
      );
      await repairPreviewAfterEdit(message, next);
    } catch (error) {
      reportNonFatal("chatEditMessage", error, { where: "ChatScreen" });
      Alert.alert(t("errorTitle"), t("messageEditFailed"));
    }
  };

  const handleDeleteMessage = (message) => {
    closeActions();
    if (message.senderId !== user?.uid) return;
    Alert.alert(t("chatDeleteMessageTitle"), t("chatDeleteMessageConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("chatDelete"),
        style: "destructive",
        onPress: async () => {
          try {
            // A physical delete, not a tombstone.
            //
            // Tombstoning left "Message deleted" in the thread forever, which
            // is a different product than the one asked for: deleting should
            // close the gap as though the message had never been there.
            //
            // What the document going away does NOT do by itself is reach the
            // two places a copy of it can survive — an already-loaded
            // historical page on either device, and the quote inside somebody
            // else's reply. The first is handled below and on focus; the
            // second is handled by cleanupDeletedMessageMedia on the server,
            // because a client cannot be relied on to perform a second write.
            await deleteDoc(
              doc(firestore, "conversations", conversationId, "messages", message.id),
            );

            // The live listener drops it from liveMessages on its own. An
            // older page does not: it was read once with getDocs and is never
            // watched again, so without this the sender goes on seeing their
            // own deleted message until the thread is remounted.
            setOlderMessages((current) =>
              current.filter((m) => m.id !== message.id),
            );

            await repairPreviewAfterDelete(message);
          } catch (error) {
            // The message stays on everybody's screen. Saying so is the
            // difference between "it did not delete" and "it deleted and
            // came back".
            reportNonFatal("chatDeleteMessage", error, { where: "ChatScreen" });
            Alert.alert(t("errorTitle"), t("messageDeleteFailed"));
          }
        },
      },
    ]);
  };

  const handleSend = async () => {
    const messageText = text.trim();
    if (!messageText || !user || !conversation || isBlocked) return;
    setText("");
    setIsSending(true);
    try {
      const quoted = replyingTo;
      setReplyingTo(null);
      const created = await addDoc(
        collection(firestore, "conversations", conversationId, "messages"),
        {
          senderId: user.uid,
          text: messageText,
          createdAt: serverTimestamp(),
          ...(quoted ? { replyTo: replySnapshot(quoted) } : {}),
        },
      );
      await updateLastMessage({
        messageId: created.id,
        messageType: "text",
        preview: messageText,
      });
    } catch (error) {
      Alert.alert(t("errorChatFailedTitle"), t("errorChatFailed"));
    } finally {
      setIsSending(false);
    }
  };

  // The only path from a chosen image to Storage. Clears the preview first
  // so a second tap on Send cannot start a second upload of the same asset.
  const handleSendPendingImage = async () => {
    if (!pendingImage || isUploading) return;
    const asset = pendingImage;
    setPendingImage(null);
    await uploadAndSendImage(asset);
  };

  const uploadAndSendImage = async (asset) => {
    setIsUploading(true);
    try {
      const extension = asset.uri.split(".").pop().split("?")[0] || "jpg";
      const fileName = `${user.uid}-${Date.now()}.${extension}`;
      const storageRef = ref(
        storage,
        `conversations/${conversationId}/${fileName}`,
      );
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await new Promise((resolve, reject) => {
        // Storage rules require a matching contentType — the blob's own
        // `type` from a local file:// URI is unreliable, so set it explicitly.
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: asset.mimeType || "image/jpeg",
          cacheControl: PRIVATE_UPLOAD_CACHE,
        });
        uploadTask.on("state_changed", null, reject, resolve);
      });
      const imageUrl = await getDownloadURL(storageRef);

      const quoted = replyingTo;
      setReplyingTo(null);
      const created = await addDoc(
        collection(firestore, "conversations", conversationId, "messages"),
        {
          senderId: user.uid,
          imageUrl,
          createdAt: serverTimestamp(),
          ...(quoted ? { replyTo: replySnapshot(quoted) } : {}),
        },
      );
      await updateLastMessage({
        messageId: created.id,
        messageType: "image",
        preview: null,
      });
    } catch (error) {
      Alert.alert(t("errorChatFailedTitle"), t("errorUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    const allowed = await ensureCameraAccess({
      t,
      title: t("errorChatFailedTitle"),
    });
    if (!allowed) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    // Staged, not sent. See the pendingImage branch in InputRow.
    setPendingImage((await downscalePickedAssets(result.assets))[0]);
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    setPendingImage((await downscalePickedAssets(result.assets))[0]);
  };

  // Opened straight into the picker when the caller asked for it, and only
  // once — a ref rather than state so a re-render cannot reopen the sheet
  // over itself, and so dismissing the picker does not immediately bring it
  // back.
  const attachRequested = useRef(false);
  useEffect(() => {
    if (!attachOnOpen || attachRequested.current) return;
    attachRequested.current = true;
    handleAttachImage();
  }, [attachOnOpen]);

  const handleAttachImage = () => {
    if (!user || !conversation || isBlocked || isUploading) return;
    Alert.alert(t("chatAttachImageTitle"), undefined, [
      { text: t("takePhotoOption"), onPress: handleTakePhoto },
      { text: t("chooseFromLibraryOption"), onPress: handlePickFromLibrary },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const handleStartRecording = async () => {
    if (!user || !conversation || isBlocked || isUploading) return;
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("errorChatFailedTitle"), t("chatMicPermissionDenied"));
      return;
    }
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      Alert.alert(t("errorChatFailedTitle"), t("errorRecordingFailed"));
    }
  };

  const handleCancelRecording = async () => {
    try {
      await audioRecorder.stop();
    } catch (error) {
      // Nothing to clean up if the recorder was never started.
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
  };

  const handleStopRecording = async () => {
    // Captured before stop() — the recorder's duration resets once stopped,
    // so reading it afterward would always look like "too short".
    const durationSeconds = recorderState.durationMillis / 1000;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      // Switch back to playback mode so the preview below can be heard.
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (!uri || durationSeconds < 1) return;
      setRecordedClip({ uri, duration: durationSeconds });
    } catch (error) {
      Alert.alert(t("errorChatFailedTitle"), t("errorRecordingFailed"));
    }
  };

  const handleDiscardRecording = () => {
    setRecordedClip(null);
  };

  const handleSendRecording = async () => {
    if (!recordedClip || !user || !conversation) return;
    const { uri, duration } = recordedClip;
    setIsUploading(true);
    try {
      const extension = uri.split(".").pop().split("?")[0] || "m4a";
      const fileName = `${user.uid}-${Date.now()}.${extension}`;
      const storageRef = ref(
        storage,
        `conversations/${conversationId}/${fileName}`,
      );
      const response = await fetch(uri);
      const blob = await response.blob();
      await new Promise((resolve, reject) => {
        // Storage rules require a matching contentType — the blob's own
        // `type` from a local file:// URI is unreliable, so set it explicitly.
        //
        // "audio/m4a" is not a registered media type. RecordingPresets
        // .HIGH_QUALITY writes MPEG-4/AAC on both platforms, whose type is
        // audio/mp4, and this string becomes the Content-Type header Storage
        // serves the clip under. A player that trusts the header rather than
        // sniffing the bytes has nothing to match it against.
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: "audio/mp4",
          cacheControl: PRIVATE_UPLOAD_CACHE,
        });
        uploadTask.on("state_changed", null, reject, resolve);
      });
      const audioUrl = await getDownloadURL(storageRef);

      const quoted = replyingTo;
      setReplyingTo(null);
      const created = await addDoc(
        collection(firestore, "conversations", conversationId, "messages"),
        {
          senderId: user.uid,
          audioUrl,
          audioDuration: duration,
          createdAt: serverTimestamp(),
          ...(quoted ? { replyTo: replySnapshot(quoted) } : {}),
        },
      );
      await updateLastMessage({
        messageId: created.id,
        messageType: "audio",
        preview: null,
      });
      setRecordedClip(null);
    } catch (error) {
      Alert.alert(t("errorChatFailedTitle"), t("errorUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Flex
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Container edges={["left", "right", "bottom"]}>
        {/* The nav header names the listing; this names the person. Both
            matter, and only one of them can be rated. */}
        {otherUid ? (
          <CounterpartBar onPress={openOtherProfile}>
            {/* The OTHER participant, never the reader: otherUid is the
                participant that is not user.uid, and otherStats is the public
                projection for exactly that uid.
            
                This costs no read. useSellerStats(otherUid) was already
                listening here for the rating shown under the name, and photoUrl
                rides on the same document — so the header gained a face without
                gaining a query. */}
            <PublicAvatar
              photoUrl={otherStats?.photoUrl}
              name={otherName ?? otherStats?.displayName}
              size={44}
            />
            <CounterpartCol>
              <CounterpartName numberOfLines={1}>
                {otherName ?? t("chatUnknownParticipant")}
              </CounterpartName>
              {otherStats?.ratingCount ? (
                <CounterpartMeta>
                  <Ionicons name="star" size={11} color="#D9A441" />
                  <CounterpartMetaLabel>
                    {otherStats.rating.toFixed(1).replace(".", ",")} ·{" "}
                    {t("ratingCount", { count: otherStats.ratingCount })}
                  </CounterpartMetaLabel>
                </CounterpartMeta>
              ) : (
                <CounterpartMetaLabel>
                  {t("chatOpenProfile")}
                </CounterpartMetaLabel>
              )}
            </CounterpartCol>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textMuted}
            />
          </CounterpartBar>
        ) : null}
        <FlatList
          data={messages ?? []}
          keyExtractor={(item) => item.id}
          inverted
          // The list is inverted, so its "end" is the TOP of the thread —
          // which makes onEndReached exactly the right hook for "load
          // earlier" and needs no scroll maths of its own.
          onEndReached={loadEarlierMessages}
          onEndReachedThreshold={0.4}
          // Inverted again: the footer renders at the top, above the oldest
          // message on screen, which is where a "fetching older messages"
          // spinner belongs.
          ListFooterComponent={
            loadingEarlier ? (
              <LoadingEarlierRow>
                <ActivityIndicator color={colors.primary} />
              </LoadingEarlierRow>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item, index }) => {
            const isMine = item.senderId === user?.uid;
            const itemKind = messageKind(item);

            // The list is INVERTED: index 0 is the newest message and sits at
            // the bottom, so index + 1 is the one visually ABOVE this a one,
            // and index - 1 is the one below. Getting this backwards puts
            // every date separator under the wrong day, which is the kind of
            // wrong that still looks plausible.
            const own = dateOf(item);
            const older = dateOf(messages?.[index + 1]);
            const newer = dateOf(messages?.[index - 1]);

            // A separator introduces the first message of a day. Reading
            // upward, that is the message whose older neighbour fell on a
            // different day — or the very oldest message loaded, which always
            // needs one. Rendered before the row so it lands above it.
            const startsDay =
              own && (!older || dayKeyOf(own) !== dayKeyOf(older));

            // One time per run, on the run's last line. The run ends where
            // the next newer message belongs to somebody else or arrives
            // outside the grouping window — and always on the newest message,
            // which has nothing after it.
            const endsRun =
              !messages?.[index - 1] ||
              messages[index - 1].senderId !== item.senderId ||
              !newer ||
              !own ||
              newer.getTime() - own.getTime() > GROUP_WINDOW_MS;

            const showTime = Boolean(own && endsRun);

            return (
              <>
              <BubbleRow mine={isMine}>
                {/* Two different permissions on one bubble, and they were
                    previously collapsed into one.

                    `disabled={!isMine}` was there so the recipient could not
                    long-press somebody else's message into the delete
                    prompt. It also swallowed every tap, so an image sent TO
                    you could not be opened — and since there was no onPress
                    at all, neither could one you sent yourself. A photo
                    arrived in the conversation and could only ever be looked
                    at as a thumbnail.

                    Viewing and deleting are now separate: onPress opens any
                    image for either party, onLongPress is attached only for
                    the sender, and the bubble stays enabled when it is mine
                    OR when there is an image to open. A text message from the
                    other person is still inert, exactly as before. */}
                <Bubble
                  mine={isMine}
                  noPadding={Boolean(item.imageUrl)}
                  onPress={
                    item.imageUrl
                      ? () => setLightboxUri(item.imageUrl)
                      : undefined
                  }
                  onLongPress={() => openActions(item)}
                  delayLongPress={350}
                  /* Previously `!isMine && !item.imageUrl`, which disabled a
                     received text bubble outright — and a disabled Pressable
                     swallows the long press as well as the tap, so Reply,
                     Copy and Share could never reach a message somebody sent
                     you.

                     Every bubble is now pressable, and the two gestures are
                     kept apart by what each one is given: onPress exists only
                     where a tap already meant something (open the photo), so
                     a received text bubble long-presses without gaining a tap
                     action it never had. A tombstone is inert again — there
                     is nothing to open and nothing to act on. */
                  disabled={itemKind === MESSAGE_DELETED}
                >
                  {/* The quote, above the content, from the snapshot stored on
                      this message — never a lookup of the original, which may
                      have been edited or deleted since. */}
                  {item.replyTo ? (
                    <ReplyQuote mine={isMine}>
                      <ReplyQuoteWho mine={isMine} numberOfLines={1}>
                        {item.replyTo.senderId === user?.uid
                          ? t("chatReplyToYou")
                          : (otherName ?? t("chatUnknownParticipant"))}
                      </ReplyQuoteWho>
                      <ReplyQuoteText
                        mine={isMine}
                        numberOfLines={2}
                        /* "unavailable" is written only by cleanupDeletedMessageMedia,
                           with the Admin SDK, when the quoted message is deleted. The
                           create rule restricts replyTo.type to text/image/audio, so no
                           client can put a message into this state — and textPreview is
                           DROPPED from the document rather than blanked, so there is no
                           quoted text left to render even if this branch were missed. */
                        unavailable={item.replyTo.type === "unavailable"}
                      >
                        {item.replyTo.type === "unavailable"
                          ? t("chatReplyUnavailable")
                          : item.replyTo.type === "image"
                            ? t("chatReplyPhoto")
                            : item.replyTo.type === "audio"
                              ? t("chatReplyVoice")
                              : (item.replyTo.textPreview ?? "")}
                      </ReplyQuoteText>
                    </ReplyQuote>
                  ) : null}
                  {itemKind === MESSAGE_DELETED ? (
                    <DeletedText mine={isMine}>
                      {t("chatMessageDeleted")}
                    </DeletedText>
                  ) : item.imageUrl ? (
                    <MessageImage
                      source={{ uri: item.imageUrl }}
                      resizeMode="contain"
                    />
                  ) : item.audioUrl ? (
                    <VoiceMessageBubble
                      uri={item.audioUrl}
                      mine={isMine}
                      knownDuration={item.audioDuration}
                      played={playedAudio.has(item.id)}
                      onPlayed={() => markAudioPlayed(item.id)}
                    />
                  ) : (
                    <BubbleText mine={isMine}>
                      {item.text}
                      {item.editedAt ? (
                        <EditedMark mine={isMine}>
                          {`  ${t("chatMessageEdited")}`}
                        </EditedMark>
                      ) : null}
                    </BubbleText>
                  )}
                </Bubble>
                {/* Outside the bubble rather than inside it.

                    An image message is `noPadding` and its MessageImage
                    fills the bubble edge to edge, so a tick placed inside
                    would either sit on top of the photograph or force
                    padding back and reopen the letterboxing the image
                    bubble exists to avoid. Beside the bubble, aligned to its
                    bottom, it reads the same for text, photo and voice. */}
                {showTime || isMine ? (
                  <MetaColumn>
                    {showTime ? (
                      <MetaTime>{timeFormatter.format(own)}</MetaTime>
                    ) : null}
                    {isMine ? <ReadReceipt state={readStateFor(item)} /> : null}
                  </MetaColumn>
                ) : null}
              </BubbleRow>
              {/* AFTER the row, which is what puts it ABOVE on screen.
                  That is not a typo, and it is the bug this replaced.

                  Work it through, because normal-list intuition gets it
                  backwards every time:

                    data        messages[0] is the NEWEST message
                    inverted    index 0 is drawn at the BOTTOM, so reading
                                the screen downward walks indices DOWNWARD;
                                index + 1 is the message ABOVE, index - 1 the
                                message BELOW
                    the cell    `inverted` flips the list AND each cell, and
                                on this version the net effect is that a
                                cell's own children are laid out bottom-up —
                                verified on a device, not assumed

                  A day label belongs above the first message of that day in
                  human reading order. Reading order is top-down, so the
                  first message of a day is its OLDEST one — the highest
                  index in that day — which is what startsDay selects.

                  Rendered before the row, that label came out BELOW its own
                  message: on the device "Today" sat between 03:27 and 03:30,
                  both of which were the same day, so it appeared to
                  introduce the wrong message. Rendered after the row, the
                  cell flip puts it where it belongs.

                  check-chat-chronology.js asserts this ORDER specifically,
                  because the previous suite asserted the index arithmetic —
                  which was already correct — and passed while the screen was
                  visibly wrong. */}
              {startsDay ? (
                <DaySeparatorRow>
                  <DaySeparatorPill>
                    <DaySeparatorText>
                      {separatorLabelFor(own)}
                    </DaySeparatorText>
                  </DaySeparatorPill>
                </DaySeparatorRow>
              ) : null}
              </>
            );
          }}
        />

        {isBlocked ? (
          <BlockedBanner>
            <BlockedBannerText>
              {iBlocked
                ? t("chatYouBlockedBanner")
                : t("chatBlockedByOtherBanner")}
            </BlockedBannerText>
            {iBlocked ? (
              <Pressable onPress={handleBlockToggle}>
                <UnblockLinkText>{t("chatUnblockUser")}</UnblockLinkText>
              </Pressable>
            ) : null}
          </BlockedBanner>
        ) : (
          <>
          {/* Quoting: a compact strip above the composer naming what is being
              replied to, with an explicit way out. Above the InputRow rather
              than inside it, so the composer's own layout — attach, grow,
              send — is untouched. */}
          {replyingTo ? (
            <ComposerContextBar>
              <ComposerContextRule />
              <ComposerContextBody>
                <ComposerContextWho numberOfLines={1}>
                  {replyingTo.senderId === user?.uid
                    ? t("chatReplyToYou")
                    : (otherName ?? t("chatUnknownParticipant"))}
                </ComposerContextWho>
                <ComposerContextText numberOfLines={1}>
                  {messageKind(replyingTo) === MESSAGE_IMAGE
                    ? t("chatReplyPhoto")
                    : messageKind(replyingTo) === MESSAGE_AUDIO
                      ? t("chatReplyVoice")
                      : (replyingTo.text ?? "")}
                </ComposerContextText>
              </ComposerContextBody>
              <Pressable
                onPress={() => setReplyingTo(null)}
                hitSlop={10}
                accessibilityLabel={t("cancel")}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </ComposerContextBar>
          ) : null}
          {/* Editing: the same strip, saying so. Without it the composer is
              pre-filled with old text and nothing explains why. */}
          {editingMessage ? (
            <ComposerContextBar>
              <ComposerContextRule editing />
              <ComposerContextBody>
                <ComposerContextWho numberOfLines={1}>
                  {t("chatEditingMessage")}
                </ComposerContextWho>
                <ComposerContextText numberOfLines={1}>
                  {editingMessage.text ?? ""}
                </ComposerContextText>
              </ComposerContextBody>
              <Pressable
                onPress={cancelEdit}
                hitSlop={10}
                accessibilityLabel={t("cancel")}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </ComposerContextBar>
          ) : null}
          <InputRow>
            {pendingImage ? (
              /* Chosen but not sent. Deliberately the same shape as the
                 recorded-clip branch below — discard on the left, the thing
                 itself in the middle, an explicit send on the right — because
                 a voice note already worked this way and a photograph did
                 not. Picking from the gallery uploaded and posted the image
                 in one motion, so the first time the sender saw what they had
                 chosen was after the other person could already see it.

                 Nothing reaches Storage or Firestore from this state. The
                 asset is a local file:// URI until Send is pressed, so
                 discarding costs nothing and changing the selection cannot
                 leave an orphan behind. */
              <>
                <IconButton
                  onPress={() => setPendingImage(null)}
                  disabled={isUploading}
                  hitSlop={8}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                </IconButton>
                <PendingImageContainer>
                  <PendingImagePreview
                    source={{ uri: pendingImage.uri }}
                    resizeMode="cover"
                  />
                  <PendingImageChange
                    onPress={handleAttachImage}
                    disabled={isUploading}
                    hitSlop={8}
                  >
                    <PendingImageChangeText>
                      {t("chatImageChange")}
                    </PendingImageChangeText>
                  </PendingImageChange>
                </PendingImageContainer>
                <SendButton
                  onPress={handleSendPendingImage}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator color={colors.textInverse} />
                  ) : (
                    <Ionicons
                      name="send"
                      size={18}
                      color={colors.textInverse}
                    />
                  )}
                </SendButton>
              </>
            ) : recordedClip ? (
              <>
                <IconButton
                  onPress={handleDiscardRecording}
                  disabled={isUploading}
                  hitSlop={8}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.textMuted}
                  />
                </IconButton>
                <PreviewPlayerContainer>
                  <VoiceMessageBubble
                    uri={recordedClip.uri}
                    mine={false}
                    knownDuration={recordedClip.duration}
                  />
                </PreviewPlayerContainer>
                <SendButton
                  onPress={handleSendRecording}
                  disabled={isUploading}
                >
                  <Ionicons name="send" size={18} color={colors.textInverse} />
                </SendButton>
              </>
            ) : recorderState.isRecording ? (
              <>
                <RecordingIndicator>
                  <PulsingRecordingDot />
                  <RecordingDurationText>
                    {formatDuration(recorderState.durationMillis / 1000)}
                  </RecordingDurationText>
                </RecordingIndicator>
                <IconButton onPress={handleCancelRecording} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </IconButton>
                <SendButton onPress={handleStopRecording}>
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={colors.textInverse}
                  />
                </SendButton>
              </>
            ) : (
              <>
                <IconButton
                  onPress={handleAttachImage}
                  disabled={isUploading}
                  hitSlop={8}
                >
                  <Ionicons
                    name="image-outline"
                    size={22}
                    color={colors.textMuted}
                  />
                </IconButton>
                <Input
                  value={text}
                  onChangeText={setText}
                  placeholder={t("chatInputPlaceholder")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  // Mirrors the ceiling firestore.rules now enforces on a
                  // message body. Nobody types this much on a phone; it is
                  // a bound on what can be pasted into a thread that has no
                  // pagination and is read back in full by both sides.
                  maxLength={CHAT_MESSAGE_MAX}
                />
                {text.trim() ? (
                  <SendButton
                    /* The same button saves an edit. A second one beside it
                       would mean two send affordances on a row with space for
                       one, and an edit IS the send for a message already on
                       screen. */
                    onPress={editingMessage ? handleSaveEdit : handleSend}
                    disabled={isSending}
                  >
                    <Ionicons
                      name={editingMessage ? "checkmark" : "send"}
                      size={18}
                      color={colors.textInverse}
                    />
                  </SendButton>
                ) : (
                  <SendButton
                    onPress={handleStartRecording}
                    disabled={isUploading}
                  >
                    <Ionicons
                      name="mic-outline"
                      size={18}
                      color={colors.textInverse}
                    />
                  </SendButton>
                )}
              </>
            )}
          </InputRow>
          </>
        )}
      </Container>
      {/* ── The long-press sheet ──────────────────────────────────────
          Rendered from actionsFor(), so what a row offers and what the
          tests assert come from one function rather than two descriptions
          of a single intention that can drift apart. */}
      <Modal
        visible={Boolean(actionMessage)}
        transparent
        animationType="fade"
        onRequestClose={closeActions}
      >
        <SheetBackdrop onPress={closeActions}>
          {/* A tap inside the sheet must not dismiss it: the backdrop is
              the dismiss target, the sheet is not. */}
          <ActionSheet onStartShouldSetResponder={() => true}>
            <SheetGrabber />
            {actionRows.map((row) => (
              <ActionRow
                key={row.key}
                onPress={row.onPress}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <Ionicons
                  name={row.icon}
                  size={20}
                  color={row.destructive ? colors.error : colors.text}
                />
                <ActionLabel destructive={row.destructive}>
                  {row.label}
                </ActionLabel>
              </ActionRow>
            ))}
          </ActionSheet>
        </SheetBackdrop>
      </Modal>
      {/* Copy has to say something. A clipboard write is invisible, and a
          silent action reads as one that did not happen. Local to this
          screen rather than a new app-wide toast system. */}
      {toast ? (
        <ToastPill pointerEvents="none">
          <ToastText>{toast}</ToastText>
        </ToastPill>
      ) : null}
      {/* One image at a time: a chat is a stream rather than a gallery, so
          there is no sensible "next photo" to page to — the message above
          might be a voice note. ImageLightbox takes an array and shows its
          counter only when there is more than one, so a single entry gives
          the pinch, pan and rotation behaviour with no pager chrome. */}
      {lightboxUri ? (
        <ImageLightbox
          visible
          media={[{ uri: lightboxUri, isVideo: false }]}
          onClose={() => setLightboxUri(null)}
        />
      ) : null}
    </Flex>
  );
}

const Flex = styled.KeyboardAvoidingView`
  flex: 1;
`;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const CounterpartBar = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: 10px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const CounterpartAvatar = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.primary};
`;

const CounterpartInitial = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
`;

const CounterpartCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const CounterpartName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const CounterpartMeta = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const CounterpartMetaLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const BubbleRow = styled.View`
  flex-direction: row;
  justify-content: ${(props) => (props.mine ? "flex-end" : "flex-start")};
  align-items: flex-end;
  margin-bottom: ${spacing.sm}px;
`;

const ReceiptSlot = styled.View`
  width: 18px;
  align-items: center;
`;

// Time and tick live BESIDE the bubble, never inside it.
//
// Inside would mean threading a timestamp through three different bubble
// bodies — text, a full-bleed image with no padding, and the voice player's
// fixed-width scrub track — and the image one has no room for it that is not
// on top of the photograph. Beside the bubble, the same column serves all
// three and none of their layouts had to change.
const MetaColumn = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 3px;
  margin-left: 4px;
  margin-bottom: 2px;
`;

const MetaTime = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

const DaySeparatorRow = styled.View`
  align-items: center;
  margin-vertical: ${spacing.sm}px;
`;

// A pill rather than the more usual rule-with-text-through-it: the thread
// background is not a flat colour behind every message, and a hairline
// crossing an image bubble's shoulder looked like a rendering fault.
const DaySeparatorPill = styled.View`
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 3px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const DaySeparatorText = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;

// The sender's own view of what happened to a message: stored, or seen.
//
// Only ever rendered beside an outgoing bubble — a tick on a message someone
// sent YOU would be telling you what you already know, and WhatsApp does not
// draw one either.
//
// The slot keeps its width in every state so a message does not shift
// sideways by a few pixels at the moment it is read, which is exactly when
// the reader is looking at it.
function ReadReceipt({ state }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  if (state === "pending") {
    return (
      <ReceiptSlot
        accessibilityLabel={t("chatReceiptPending")}
        accessible
      >
        <Ionicons name="time-outline" size={13} color={colors.textMuted} />
      </ReceiptSlot>
    );
  }

  const read = state === "read";
  return (
    <ReceiptSlot
      accessibilityLabel={read ? t("chatReceiptRead") : t("chatReceiptSent")}
      accessible
    >
      <Ionicons
        // checkmark-done is the two-tick glyph; checkmark is the single.
        // Colour is what separates read from sent, and the shape backs it
        // up, because a receipt that relies on colour alone is unreadable
        // to the readers most likely to be checking it.
        name={read ? "checkmark-done" : "checkmark"}
        size={14}
        color={read ? colors.readReceipt : colors.textMuted}
      />
    </ReceiptSlot>
  );
}

const Bubble = styled(Pressable)`
  max-width: 78%;
  background-color: ${(props) => (props.mine ? props.theme.primary : props.theme.surface)};
  border-radius: ${radius.lg}px;
  ${(props) => (props.mine ? "border-bottom-right-radius: 4px;" : "border-bottom-left-radius: 4px;")}
  padding-horizontal: ${(props) => (props.noPadding ? 0 : spacing.md)}px;
  padding-vertical: ${(props) => (props.noPadding ? 0 : spacing.sm)}px;
  overflow: hidden;
  ${shadow.card}
`;

const BubbleText = styled.Text`
  ${type.body}
  color: ${(props) => (props.mine ? props.theme.textInverse : props.theme.text)};
`;

// The quoted message, inside the bubble and above its content.
//
// A left rule and a wash rather than a box: the quote has to read as
// subordinate to the message carrying it, and a second bordered card inside
// a bubble reads as two messages.
// ── The long-press sheet ───────────────────────────────────────────────
const SheetBackdrop = styled(Pressable)`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.45);
  justify-content: flex-end;
`;

const ActionSheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  padding-top: ${spacing.sm}px;
  /* Room for the home indicator. The sheet is the bottom-most thing on
     screen, so without this the last row sits under the gesture bar. */
  padding-bottom: ${spacing.xl}px;
`;

const SheetGrabber = styled.View`
  width: 38px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.border};
`;

const ActionRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: ${spacing.md}px ${spacing.lg}px;
`;

const ActionLabel = styled.Text`
  ${type.body}
  color: ${(props) => (props.destructive ? props.theme.error : props.theme.text)};
`;

// ── Quoting / editing, above the composer ──────────────────────────────
const ComposerContextBar = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const ComposerContextRule = styled.View`
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  background-color: ${(props) =>
    props.editing ? props.theme.textMuted : props.theme.primary};
`;

// min-width: 0 so a long quote ellipsises instead of pushing the X off the
// right edge — the same flexbox trap the reviewer row hit.
const ComposerContextBody = styled.View`
  flex: 1;
  min-width: 0;
`;

const ComposerContextWho = styled.Text`
  ${type.caption}
  font-weight: 600;
  color: ${(props) => props.theme.primary};
`;

const ComposerContextText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

// ── Copy confirmation ──────────────────────────────────────────────────
const ToastPill = styled.View`
  position: absolute;
  bottom: 96px;
  align-self: center;
  padding: ${spacing.sm}px ${spacing.lg}px;
  border-radius: ${radius.xl}px;
  background-color: rgba(0, 0, 0, 0.82);
`;

const ToastText = styled.Text`
  ${type.caption}
  color: #ffffff;
`;

const ReplyQuote = styled.View`
  border-left-width: 3px;
  border-left-color: ${(props) =>
    props.mine ? "rgba(255,255,255,0.65)" : props.theme.primary};
  background-color: ${(props) =>
    props.mine ? "rgba(255,255,255,0.14)" : props.theme.surfaceAlt};
  border-radius: 6px;
  padding: 5px 8px;
  margin-bottom: 5px;
  /* An image bubble is noPadding, so the quote supplies its own inset or it
     sits flush against the photograph's edge. */
  margin-horizontal: ${(props) => (props.flush ? spacing.sm : 0)}px;
`;

const ReplyQuoteWho = styled.Text`
  ${type.caption}
  font-weight: 600;
  color: ${(props) => (props.mine ? props.theme.textInverse : props.theme.primary)};
`;

const ReplyQuoteText = styled.Text`
  ${type.caption}
  font-style: ${(props) => (props.unavailable ? "italic" : "normal")};
  color: ${(props) =>
    props.mine ? "rgba(255,255,255,0.85)" : props.theme.textMuted};
`;

// A tombstone. Italic and muted, because it is the app speaking about a
// message rather than the message itself.
const DeletedText = styled.Text`
  ${type.body}
  font-style: italic;
  color: ${(props) =>
    props.mine ? "rgba(255,255,255,0.75)" : props.theme.textMuted};
`;

// Rendered inside BubbleText as a trailing span, so it wraps with the last
// line instead of claiming a line of its own after a one-word message.
const EditedMark = styled.Text`
  ${type.caption}
  color: ${(props) =>
    props.mine ? "rgba(255,255,255,0.7)" : props.theme.textMuted};
`;

const MessageImage = styled.Image`
  width: 220px;
  height: 220px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const VoiceContainer = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  width: 200px;
  padding: 2px;
`;

const VoiceTrackColumn = styled.View`
  flex: 1;
  gap: 4px;
`;

const ScrubTrack = styled.View`
  width: ${SCRUB_TRACK_WIDTH}px;
  height: 20px;
  justify-content: center;
`;

const ScrubTrackBg = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 2px;
  background-color: ${(props) => (props.mine ? "rgba(255,255,255,0.35)" : props.theme.border)};
`;

const ScrubTrackFill = styled.View`
  position: absolute;
  left: 0;
  height: 3px;
  border-radius: 2px;
  background-color: ${(props) =>
    props.played
      ? props.theme.accent
      : props.mine
        ? props.theme.textInverse
        : props.theme.primary};
`;

const ScrubThumb = styled.View`
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-left: -5px;
  background-color: ${(props) =>
    props.played
      ? props.theme.accent
      : props.mine
        ? props.theme.textInverse
        : props.theme.primary};
`;

const VoiceDuration = styled.Text`
  ${type.caption}
  color: ${(props) => (props.mine ? props.theme.textInverse : props.theme.textMuted)};
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: flex-end;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const PreviewPlayerContainer = styled.View`
  flex: 1;
  align-items: flex-start;
  padding-vertical: ${spacing.xs}px;
`;

// The chosen-but-unsent image, sized to sit in the composer rather than to
// be admired: big enough to tell two photographs apart, small enough that
// the send button and the discard button are both still reachable with a
// thumb. Tapping "Change" reopens the same picker, replacing the selection —
// the old one was never uploaded, so there is nothing to clean up.
const PendingImageContainer = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-vertical: ${spacing.xs}px;
`;

const PendingImagePreview = styled.Image`
  width: 56px;
  height: 56px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const PendingImageChange = styled(Pressable)`
  padding: ${spacing.xs}px 0px;
`;

const PendingImageChangeText = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const IconButton = styled(Pressable)`
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const Input = styled.TextInput`
  flex: 1;
  max-height: 100px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const SendButton = styled(Pressable)`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
  opacity: ${(props) => (props.disabled ? 0.5 : 1)};
`;

const RecordingIndicator = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.lg}px;
`;

const RecordingDot = styled(Animated.View)`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${(props) => props.theme.error};
`;

const RecordingDurationText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const BlockedBanner = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const BlockedBannerText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const UnblockLinkText = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
`;

const LoadingEarlierRow = styled.View`
  padding-vertical: ${spacing.md}px;
  align-items: center;
`;
