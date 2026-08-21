import { useEffect, useRef, useState } from "react";
import { Alert, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";

// Lets someone speak what they're looking for instead of typing it — tapping
// the mic starts on-device/system speech recognition (expo-speech-recognition,
// wrapping iOS's SFSpeechRecognizer and Android's SpeechRecognizer) and the
// live transcript is piped straight into the same onChangeText every screen
// already wires up for typed input, so every SearchBar call site gets voice
// search for free with no changes on their end.
// expo-speech-recognition emits its events globally, not per-subscriber, so
// every mounted SearchBar hears every event. That's fine on a screen with
// one search field, and wrong everywhere else: ForYouScreen has three
// mounted at once (the header, plus one in each bottom-sheet modal), so
// tapping the mic inside the city sheet made all three clear themselves on
// `start` and all three write the transcript on `result` — the spoken city
// landed in the page's product query as well as the sheet's, and whichever
// field the user was looking at appeared to misbehave.
//
// A module-level token records which instance actually initiated
// recognition; the rest ignore the events. It lives outside the component
// on purpose — there is exactly one recognizer on the device, so exactly
// one instance can own it at a time.
// Longer than a normal dictation pause, short enough that a recogniser
// which never reports back can't strand the button.
const LISTEN_TIMEOUT_MS = 15000;

let activeInstanceId = null;
let instanceCounter = 0;

// `onDark` is an opt-in variant, not a fork: the hero on the vehicles screen
// puts the field on a saturated green banner, where the surfaceAlt fill and
// the hairline border below both disappear. Everything else — voice search,
// the clear button, the focus feedback — is shared exactly as before.
export function SearchBar({ value, onChangeText, placeholder, onDark }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const [isListening, setIsListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const instanceId = useRef(null);
  if (instanceId.current === null) {
    instanceCounter += 1;
    instanceId.current = instanceCounter;
  }
  const isOwner = () => activeInstanceId === instanceId.current;

  useSpeechRecognitionEvent("start", () => {
    if (isOwner()) setIsListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    if (!isOwner()) return;
    setIsListening(false);
    activeInstanceId = null;
    // Give the session back, so a muted preview video or a voice message
    // isn't left competing with a recording-mode session nobody is using.
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (!isOwner()) return;
    const transcript = event.results?.[0]?.transcript;
    if (transcript) onChangeText(transcript);
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!isOwner()) return;
    clearListenTimeout();
    activeInstanceId = null;
    setIsListening(false);
    // "no-speech"/"aborted" are routine (silence timeout, user tapped stop).
    // Everything else is reported: an `audio-capture` failure used to fall
    // through this branch silently, which is what made a broken mic look
    // like a dead button for so long.
    if (event.error === "no-speech" || event.error === "aborted") return;
    if (
      event.error === "not-allowed" ||
      event.error === "service-not-allowed"
    ) {
      Alert.alert(
        t("voiceSearchPermissionDeniedTitle"),
        t("voiceSearchPermissionDeniedMessage"),
      );
      return;
    }
    Alert.alert(
      t("voiceSearchPermissionDeniedTitle"),
      `${t("voiceSearchUnavailable")}\n\n${event.error}${event.message ? `: ${event.message}` : ""}`,
    );
  });

  // Recognition keeps running until the device stops hearing speech, but
  // nothing here should outlive the screen that mounted it — a user
  // navigating away mid-search shouldn't leave the mic silently listening.
  // Read through a ref, not the state value: with an empty dep array the
  // cleanup closes over `isListening` from the first render, which is always
  // false — so the mic was never actually stopped on unmount, and closing a
  // sheet mid-dictation left the recognizer running.
  // Hard stop for a recogniser that starts but never reports back. iOS
  // normally ends on silence, but if that event never arrives the mic sits
  // lit forever with no way out except leaving the screen — the user can't
  // even tap it again to cancel, because the button's only other job is to
  // stop something the UI thinks is still running.
  const listenTimeoutRef = useRef(null);
  const clearListenTimeout = () => {
    if (listenTimeoutRef.current) {
      clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
  };

  const isListeningRef = useRef(false);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    const id = instanceId.current;
    return () => {
      clearListenTimeout();
      if (isListeningRef.current) ExpoSpeechRecognitionModule.stop();
      if (activeInstanceId === id) activeInstanceId = null;
    };
  }, []);

  // Every call below crosses into a native module, and any of them can
  // reject — a missing or SDK-mismatched build of expo-speech-recognition
  // throws here rather than returning false. Without this wrapper those
  // rejections were unhandled, so a broken recognizer looked exactly like a
  // dead button: no alert, no state change, nothing to report. Anything
  // unexpected now surfaces instead of vanishing.
  const toggleVoiceSearch = async () => {
    try {
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }

      const available =
        await ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) {
        Alert.alert(
          t("voiceSearchPermissionDeniedTitle"),
          t("voiceSearchUnavailable"),
        );
        return;
      }

      const result =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert(
          t("voiceSearchPermissionDeniedTitle"),
          t("voiceSearchPermissionDeniedMessage"),
        );
        return;
      }

      // Deliberately NOT calling expo-audio's setAudioModeAsync here.
      // It configures and activates the shared session itself, and the
      // recognizer then sets its own category and calls setActive on an
      // already-active session — which is what iOS refuses with "Session
      // activation failed". The recognizer asks for playAndRecord below, so
      // it does not need expo-audio's help to be allowed to record.

      // Claim ownership before starting, so the events this produces are
      // routed back to this field and no other.
      activeInstanceId = instanceId.current;
      clearListenTimeout();
      listenTimeoutRef.current = setTimeout(() => {
        listenTimeoutRef.current = null;
        if (!isListeningRef.current) return;
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {
          // Already stopped — the state reset below is what matters.
        }
        activeInstanceId = null;
        setIsListening(false);
      }, LISTEN_TIMEOUT_MS);
      onChangeText("");
      ExpoSpeechRecognitionModule.start({
        lang: language === "en" ? "en-US" : "fr-FR",
        interimResults: true,
        continuous: false,
        // The activation failure came from the audio *mode*, not the
        // category. Both of the library's paths (with or without an
        // iosCategory) default `mode` to `.measurement` — the mode that
        // disables system audio processing — and iOS then refuses
        // `setActive(true)` with "Session activation failed", surfaced as
        // `audio-capture`. `.measurement` buys nothing for dictation, so
        // this asks for the ordinary mode instead, which activates cleanly
        // alongside the app's other audio.
        iosCategory: {
          category: "playAndRecord",
          categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
          mode: "default",
        },
      });
    } catch (error) {
      activeInstanceId = null;
      setIsListening(false);
      Alert.alert(
        t("voiceSearchPermissionDeniedTitle"),
        `${t("voiceSearchUnavailable")}\n\n${error?.message ?? error}`,
      );
    }
  };
  return (
    <Container focused={isFocused} listening={isListening} onDark={onDark}>
      <Ionicons
        name="search"
        size={18}
        color={
          onDark
            ? "rgba(255,255,255,0.82)"
            : isFocused || isListening
              ? colors.primary
              : colors.textMuted
        }
      />
      <Input
        onDark={onDark}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={
          isListening
            ? t("voiceSearchListeningHint")
            : (placeholder ?? t("searchPlaceholder"))
        }
        placeholderTextColor={
          onDark
            ? "rgba(255,255,255,0.6)"
            : isListening
              ? colors.primary
              : colors.textMuted
        }
      />
      {value.length > 0 ? (
        <ClearButton onPress={() => onChangeText("")} hitSlop={8}>
          <Ionicons
            name="close-circle"
            size={18}
            color={onDark ? "rgba(255,255,255,0.7)" : colors.textMuted}
          />
        </ClearButton>
      ) : null}
      <MicButton
        onPress={toggleVoiceSearch}
        hitSlop={8}
        listening={isListening}
        onDark={onDark}
      >
        <Ionicons
          name={isListening ? "mic" : "mic-outline"}
          size={19}
          color={
            onDark
              ? "rgba(255,255,255,0.82)"
              : isListening
                ? colors.primary
                : colors.textMuted
          }
        />
      </MicButton>
    </Container>
  );
}

// Shared by eight screens, so this is deliberately a global change rather
// than a per-screen variant. surfaceAlt is kept as the fill — some screens
// sit on `surface`, where a surface-coloured field would vanish — and the
// definition comes from a hairline border instead.
const Container = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${(props) =>
    props.onDark ? "rgba(255, 255, 255, 0.14)" : props.theme.surfaceAlt};
  border-radius: ${radius.lg}px;
  /* The field says when it is live. Without this there was no feedback at
     all between tapping it and typing, and none while the mic listens. */
  border-width: 1.5px;
  border-color: ${(props) =>
    props.onDark
      ? props.listening || props.focused
        ? "rgba(255, 255, 255, 0.75)"
        : "rgba(255, 255, 255, 0.22)"
      : props.listening || props.focused
        ? props.theme.primary
        : props.theme.border};
  padding-horizontal: 14px;
  height: 50px;
  /* On a banner the parent owns the spacing, and a card shadow over a
     gradient reads as a smudge rather than lift. */
  margin-horizontal: ${(props) => (props.onDark ? 0 : spacing.md)}px;
  margin-top: ${(props) => (props.onDark ? 0 : spacing.sm)}px;
  gap: 10px;
  ${(props) => (props.onDark ? "" : shadow.card)}
`;

const Input = styled.TextInput`
  flex: 1;
  ${type.body}
  color: ${(props) => (props.onDark ? "#ffffff" : props.theme.text)};
`;

const ClearButton = styled(Pressable)`
  padding: 4px;
`;

// A real target, not a bare glyph. This is the control that was hard to hit
// on iOS, and 34px with a tinted ground is both easier to press and easier
// to recognise as a button.
const MicButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  margin-right: -6px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.listening
      ? props.onDark
        ? "rgba(255, 255, 255, 0.22)"
        : props.theme.primaryLight
      : "transparent"};
`;
