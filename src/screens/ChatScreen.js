import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
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
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore, storage } from "../config/firebase";
import { useSellerStats } from "../hooks/useSellerStats";

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

const SCRUB_TRACK_WIDTH = 130;

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

  const togglePlayback = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (effectiveDuration > 0 && status.currentTime >= effectiveDuration) {
      player.seekTo(0);
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
  const { conversationId, listingTitle } = route.params;
  const { t } = useI18n();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedClip, setRecordedClip] = useState(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);

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
      updateDoc(doc(firestore, "conversations", conversationId), {
        [`blockedBy.${user.uid}`]: false,
      }).catch(() => {});
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
          }).catch(() => {});
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

  useEffect(() => {
    const messagesQuery = query(
      collection(firestore, "conversations", conversationId, "messages"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })),
        );
      },
      () => setMessages([]),
    );
    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    if (!user) return;
    updateDoc(doc(firestore, "conversations", conversationId), {
      [`unreadCount.${user.uid}`]: 0,
    }).catch(() => {});
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
          ).catch(() => {});
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
    await uploadAndSendImage(result.assets[0]);
  };

  const handlePickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    await uploadAndSendImage(result.assets[0]);
  };

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
        const uploadTask = uploadBytesResumable(storageRef, blob, {
          contentType: "audio/m4a",
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
