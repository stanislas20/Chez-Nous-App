import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
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
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
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

function VoiceMessageBubble({ uri, mine, knownDuration }) {
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
          color={mine ? colors.textInverse : colors.primary}
        />
      </Pressable>
      <VoiceTrackColumn>
        <ScrubTrack {...panResponder.panHandlers}>
          <ScrubTrackBg mine={mine} />
          <ScrubTrackFill mine={mine} style={{ width: `${progress * 100}%` }} />
          <ScrubThumb mine={mine} style={{ left: `${progress * 100}%` }} />
        </ScrubTrack>
        <VoiceDuration mine={mine}>
          {formatDuration(displaySeconds)}
        </VoiceDuration>
      </VoiceTrackColumn>
    </VoiceContainer>
  );
}

export function ChatScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { conversationId, listingTitle, attachOnOpen } = route.params;
  const { t } = useI18n();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState(null);
  // The newest page, held live. Never grows.
  const [liveMessages, setLiveMessages] = useState(null);
  // Pages fetched behind it, once each, never re-read.
  const [olderMessages, setOlderMessages] = useState([]);
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
    });
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

  useEffect(() => {
    if (!user) return;
    // No alert: a failed reset shows a stale badge, which is confusing
    // rather than unsafe. It is reported so a systematic failure is visible
    // in Crashlytics instead of only in everybody's badge count.
    updateDoc(doc(firestore, "conversations", conversationId), {
      [`unreadCount.${user.uid}`]: 0,
    }).catch((error) => {
      reportNonFatal("chatUnreadReset", error, { where: "ChatScreen" });
    });
  }, [conversationId, user]);

  const updateLastMessage = async ({ messageType, preview }) => {
    const otherParticipant = conversation.participantIds.find(
      (id) => id !== user.uid,
    );
    await updateDoc(doc(firestore, "conversations", conversationId), {
      lastMessage: preview ?? null,
      lastMessageType: messageType,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: user.uid,
      [`unreadCount.${otherParticipant}`]: increment(1),
    });
  };

  const handleDeleteMessage = (message) => {
    if (message.senderId !== user?.uid) return;
    Alert.alert(t("chatDeleteMessageTitle"), t("chatDeleteMessageConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("chatDelete"),
        style: "destructive",
        onPress: () => {
          deleteDoc(
            doc(
              firestore,
              "conversations",
              conversationId,
              "messages",
              message.id,
            ),
          ).catch((error) => {
            // The message stays on everybody's screen. Saying so is the
            // difference between "it did not delete" and "it deleted and
            // came back".
            reportNonFatal("chatDeleteMessage", error, { where: "ChatScreen" });
            Alert.alert(t("errorTitle"), t("messageDeleteFailed"));
          });
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
      await addDoc(
        collection(firestore, "conversations", conversationId, "messages"),
        {
          senderId: user.uid,
          text: messageText,
          createdAt: serverTimestamp(),
        },
      );
      await updateLastMessage({ messageType: "text", preview: messageText });
    } catch (error) {
      Alert.alert(t("errorChatFailedTitle"), t("errorChatFailed"));
    } finally {
      setIsSending(false);
    }
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

      await addDoc(
        collection(firestore, "conversations", conversationId, "messages"),
        {
          senderId: user.uid,
          imageUrl,
          createdAt: serverTimestamp(),
        },
      );
      await updateLastMessage({ messageType: "image", preview: null });
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
    await uploadAndSendImage(
      (await downscalePickedAssets(result.assets))[0],
    );
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    await uploadAndSendImage(
      (await downscalePickedAssets(result.assets))[0],
    );
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

      await addDoc(
        collection(firestore, "conversations", conversationId, "messages"),
        {
          senderId: user.uid,
          audioUrl,
          audioDuration: duration,
          createdAt: serverTimestamp(),
        },
      );
      await updateLastMessage({ messageType: "audio", preview: null });
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
            <CounterpartAvatar>
              <CounterpartInitial>
                {(otherName ?? "?").trim().charAt(0).toUpperCase() || "?"}
              </CounterpartInitial>
            </CounterpartAvatar>
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
          renderItem={({ item }) => {
            const isMine = item.senderId === user?.uid;
            return (
              <BubbleRow mine={isMine}>
                <Bubble
                  mine={isMine}
                  noPadding={Boolean(item.imageUrl)}
                  onLongPress={() => handleDeleteMessage(item)}
                  delayLongPress={350}
                  disabled={!isMine}
                >
                  {item.imageUrl ? (
                    <MessageImage
                      source={{ uri: item.imageUrl }}
                      resizeMode="contain"
                    />
                  ) : item.audioUrl ? (
                    <VoiceMessageBubble
                      uri={item.audioUrl}
                      mine={isMine}
                      knownDuration={item.audioDuration}
                    />
                  ) : (
                    <BubbleText mine={isMine}>{item.text}</BubbleText>
                  )}
                </Bubble>
              </BubbleRow>
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
          <InputRow>
            {recordedClip ? (
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
                  <SendButton onPress={handleSend} disabled={isSending}>
                    <Ionicons
                      name="send"
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
        )}
      </Container>
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
  margin-bottom: ${spacing.sm}px;
`;

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
  background-color: ${(props) => (props.mine ? props.theme.textInverse : props.theme.primary)};
`;

const ScrubThumb = styled.View`
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  margin-left: -5px;
  background-color: ${(props) => (props.mine ? props.theme.textInverse : props.theme.primary)};
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
