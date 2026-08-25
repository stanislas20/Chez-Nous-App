import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { doc, setDoc } from "firebase/firestore";
import { firestore } from "../config/firebase";
import { useVehiclePapers } from "../hooks/useVehiclePapers";
import {
  ensurePushToken,
  PUSH_DENIED,
  PUSH_OK,
} from "../notifications/pushToken";
import {
  countNeedingAttention,
  getPaperLabel,
  paperKinds,
  paperPlaces,
  paperProcedures,
  paperStatus,
  sortPapers,
} from "../data/vehiclePapers";

// Navy, and the only vehicle screen that uses it. The others are trades you
// go out and find; this one is a drawer of documents, and it should not feel
// like shopping.
const NAVY = "#1F3A5F";
// The same navy is unreadable as a filled control on a dark surface — it is
// barely lighter than the card it sits on. The switch gets a raised version
// so that "on" is legible in both themes.
const NAVY_LIT = "#4E7FB8";
const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";
const TERRACOTTA = "#C1512D";

// The colour of each state, in one place. Amber for "soon" is doing work:
// it is the only one a reader can still act on comfortably, and it must not
// look like either the calm of valid or the alarm of expired.
const STATE_TINTS = {
  expired: { bg: "rgba(193,81,45,0.09)", fg: "#A03C1D", dot: TERRACOTTA },
  soon: { bg: "rgba(217,164,65,0.13)", fg: "#8a6415", dot: GOLD },
  valid: { bg: "rgba(18,161,80,0.08)", fg: EMERALD, dot: "#12A150" },
  held: { bg: "rgba(18,161,80,0.08)", fg: EMERALD, dot: "#12A150" },
  unknown: { bg: "rgba(0,0,0,0.04)", fg: "#8A8A8E", dot: "#B0B0B4" },
  missing: { bg: "rgba(0,0,0,0.04)", fg: "#8A8A8E", dot: "#B0B0B4" },
};

const TABS = [
  { key: "papers", labelKey: "papersTabMine" },
  { key: "steps", labelKey: "papersTabSteps" },
  { key: "where", labelKey: "papersTabWhere" },
];

// Papers & contrôle.
//
// A drawer for the dates that decide whether somebody may legally drive, and
// nothing else. There are no providers on this screen and no addresses: the
// app cannot see anyone's insurance certificate, so all it can honestly do is
// hold the date the owner typed and count the days.
// The date the reader typed, as the date they typed — not the instant it
// happens to be stored as. An instant means "midnight somewhere", and the
// server has no way of knowing where this phone was when it was written, so
// the calendar date is the only form that survives the trip intact.
function calendarDate(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function PapersScreen({ navigation }) {
  const { colors, scheme } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();

  const { user } = useAuth();
  const { papers, loaded, remember, rememberVehicle } = useVehiclePapers();
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleDraft, setVehicleDraft] = useState("");
  const [asking, setAsking] = useState(false);
  const [tab, setTab] = useState("papers");
  const [openProcedure, setOpenProcedure] = useState(null);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ day: "", month: "", year: "" });

  // Midnight, so "expires today" is a whole day rather than an hour that
  // silently turns into "expired" over lunch.
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const entries = useMemo(
    () =>
      sortPapers(
        paperKinds.map((kind) => ({
          kind,
          value: papers[kind.key] ?? null,
          status: paperStatus(kind, papers[kind.key] ?? null, today),
        })),
      ),
    [papers, today],
  );

  const attention = countNeedingAttention(entries);
  const recorded = entries.filter((entry) => entry.value != null).length;
  // There is nothing to remind anybody about until a date with an expiry on
  // it has been entered — a carte grise never runs out.
  const hasExpiries = entries.some(
    (entry) => entry.kind.renewable && entry.value,
  );
  const canRemind = Boolean(user) && hasExpiries;

  // Two different things, and conflating them is what shows somebody an
  // switch reading "on" over a list with no dates in it: `wanted` is the
  // choice they made and it survives deleting every date, `remindersOn` is
  // whether anything can actually be sent. The switch and the privacy note
  // both follow the second, because both are claims about what is happening
  // rather than about what was once asked for.
  const wanted = papers.reminders === true;
  const remindersOn = wanted && canRemind;

  // What a reminder needs to know, and nothing else: the expiring papers, as
  // plain calendar dates. No labels, no vehicle name, no carte grise.
  const wire = useMemo(
    () =>
      Object.fromEntries(
        paperKinds
          .filter((kind) => kind.renewable && papers[kind.key])
          .map((kind) => [kind.key, calendarDate(papers[kind.key])]),
      ),
    [papers],
  );

  // Turning reminders on is the moment the dates stop being private, so the
  // write that enables them is the same write that sends them. Off deletes
  // both, rather than leaving a copy behind on a server nobody asked.
  const syncReminders = useCallback(
    async (on, dates) => {
      if (!user) return;
      const payload = on
        ? {
            paperReminders: true,
            // The reminder is written by a server that has no other way of
            // knowing which of the two languages this reader chose.
            paperLanguage: language,
            paperDates: dates,
          }
        : {
            paperReminders: false,
            paperDates: null,
            paperRemindersSent: null,
          };
      await setDoc(doc(firestore, "sellers", user.uid), payload, {
        merge: true,
      }).catch(() => {});
    },
    [user, language],
  );

  // The server copy follows the state rather than the individual gestures.
  //
  // Wiring it to the taps instead looks simpler and is wrong: switching
  // reminders on with no dates yet, then adding one, leaves a switch reading
  // "on" over a server holding nothing — the one failure mode where the app
  // says a reminder is coming and none is. Whatever the reader ends up
  // looking at, this is what the server has.
  const sent = useRef(null);
  useEffect(() => {
    if (!loaded || !user || !remindersOn) return;
    const next = JSON.stringify(wire);
    if (sent.current === next) return;
    sent.current = next;
    syncReminders(true, wire);
  }, [loaded, user, remindersOn, wire, syncReminders]);

  const toggleReminders = () => {
    // A switch that cannot move must still answer the finger. Doing nothing
    // at all is indistinguishable from being broken — which is exactly how
    // it read on a handset with no dates on it — so the tap goes to the
    // thing standing in the way instead: the first paper with no date.
    if (!canRemind) {
      if (!user) return;
      const blank = entries.find(
        (entry) => entry.kind.renewable && !entry.value,
      );
      if (blank) openEditor(blank);
      return;
    }
    if (remindersOn) {
      remember("reminders", null);
      sent.current = null;
      syncReminders(false);
      return;
    }
    // A reminder needs somewhere to arrive. Asking here rather than
    // assuming is the difference between a switch that works and one that
    // sits on for an account the server can never reach — which is what
    // happened before this check existed.
    setAsking(true);
    ensurePushToken(user.uid)
      .then((result) => {
        setAsking(false);
        if (result === PUSH_OK) {
          // On is left to the effect above, which is the only place that
          // decides what the server holds.
          remember("reminders", true);
          return;
        }
        Alert.alert(
          t("papersRemindBlockedTitle"),
          result === PUSH_DENIED
            ? t("papersRemindBlocked")
            : t("papersRemindUnavailable"),
        );
      })
      .catch(() => setAsking(false));
  };

  // Deleting the last date silently ends the reminders, so the stored choice
  // and the server's copy go with it rather than lying dormant and firing
  // again months later when an unrelated date is added.
  const dropRemindersIfEmpty = (next) => {
    if (!wanted) return false;
    const stillHas = paperKinds.some(
      (kind) => kind.renewable && next[kind.key],
    );
    if (stillHas) return false;
    remember("reminders", null);
    sent.current = null;
    syncReminders(false);
    return true;
  };

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const statusLine = (entry) => {
    const { state, days } = entry.status;
    if (state === "expired") return t("papersExpired", { days: -days });
    if (state === "soon") return t("papersSoon", { days });
    if (state === "valid") return t("papersValid");
    if (state === "held") return t("papersHeld");
    if (state === "missing") return t("papersNotHeld");
    return t("papersNoDate");
  };

  // Handed to the phone's map rather than answered here. The app does not
  // know where the nearest testing centre is; Maps does, and it searches
  // around wherever the reader actually is.
  const openMapsFor = (place) => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.query)}`,
    ).catch(() => {});
  };

  const openEditor = (entry) => {
    if (!entry.kind.renewable) {
      remember(entry.kind.key, entry.value === true ? null : true);
      return;
    }
    const current = entry.value ? new Date(entry.value) : null;
    setDraft({
      day: current ? String(current.getDate()) : "",
      month: current ? String(current.getMonth() + 1) : "",
      year: current ? String(current.getFullYear()) : "",
    });
    setEditing(entry.kind);
  };

  const draftDate = useMemo(() => {
    const day = Number(draft.day);
    const month = Number(draft.month);
    const year = Number(draft.year);
    if (!day || !month || !year || String(year).length !== 4) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    // Rejects 31 February rather than letting JavaScript roll it into March
    // and showing the reader a date they did not type.
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }, [draft]);

  const saveDraft = () => {
    if (!draftDate || !editing) return;
    remember(editing.key, draftDate.toISOString());
    setEditing(null);
  };

  const clearDraft = () => {
    if (!editing) return;
    const next = { ...papers };
    delete next[editing.key];
    remember(editing.key, null);
    dropRemindersIfEmpty(next);
    setEditing(null);
  };

  return (
    <Container edges={["left", "right"]}>
      <Hero
        colors={["#26456E", "#162943", "#0D1828"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        topInset={insets.top}
      >
        <HeroGlow />
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <HeroEyebrow>{t("papersEyebrow")}</HeroEyebrow>
        </HeroTop>

        {/* The headline is the count, because the count is the reason to
            open this screen. With nothing entered it says so plainly rather
            than claiming everything is in order. */}
        <HeroTitle>
          {!loaded
            ? t("papersLoading")
            : attention > 0
              ? t("papersAttention", { count: attention })
              : recorded === 0
                ? t("papersEmptyTitle")
                : t("papersAllValid")}
        </HeroTitle>
        <HeroCopy>{t("papersIntro")}</HeroCopy>

        {/* The folder's name, in the reader's own words. Nothing is checked
            against anything — it is here so a household with two cars knows
            which one these dates belong to. */}
        <VehicleRow
          onPress={() => {
            setVehicleDraft(papers.vehicle ?? "");
            setVehicleOpen(true);
          }}
        >
          <Ionicons
            name="car-outline"
            size={15}
            color="rgba(255,255,255,0.72)"
          />
          <VehicleLabel numberOfLines={1}>
            {papers.vehicle || t("papersNameVehicle")}
          </VehicleLabel>
          <Ionicons
            name="chevron-forward"
            size={14}
            color="rgba(255,255,255,0.55)"
          />
        </VehicleRow>
      </Hero>

      {/* Three different errands — what I hold, what to prepare, where to go
          — so the choice sits astride the banner's edge like every other
          governing control in the app. */}
      <TabDock>
        <TabRow>
          {TABS.map((option) => {
            const active = tab === option.key;
            return (
              <Tab
                key={option.key}
                active={active}
                onPress={() => setTab(option.key)}
              >
                <TabLabel active={active} numberOfLines={1}>
                  {t(option.labelKey)}
                </TabLabel>
              </Tab>
            );
          })}
        </TabRow>
      </TabDock>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {tab === "papers"
          ? entries.map((entry) => {
              const tint = STATE_TINTS[entry.status.state];
              const actionable =
                entry.status.state === "expired" ||
                entry.status.state === "soon";
              return (
                <Card
                  key={entry.kind.key}
                  urgent={entry.status.state === "expired"}
                  onPress={() => openEditor(entry)}
                >
                  <CardIcon bg={tint.bg}>
                    <Ionicons
                      name={entry.kind.icon}
                      size={20}
                      color={tint.fg}
                    />
                  </CardIcon>

                  <CardCol>
                    <CardTitle>
                      {language === "en"
                        ? entry.kind.labelEn
                        : entry.kind.labelFr}
                    </CardTitle>
                    <StatusPill bg={tint.bg}>
                      <StatusDot color={tint.dot} />
                      <StatusLabel fg={tint.fg}>
                        {statusLine(entry)}
                      </StatusLabel>
                    </StatusPill>
                    <CardMeta numberOfLines={2}>
                      {entry.kind.renewable
                        ? entry.value
                          ? t("papersUntil", { date: formatDate(entry.value) })
                          : t("papersAddPrompt")
                        : language === "en"
                          ? entry.kind.subEn
                          : entry.kind.subFr}
                    </CardMeta>
                  </CardCol>

                  <Action urgent={actionable}>
                    <ActionLabel urgent={actionable}>
                      {entry.kind.renewable
                        ? entry.value
                          ? t("papersChange")
                          : t("papersAdd")
                        : entry.value === true
                          ? t("papersHeldShort")
                          : t("papersMark")}
                    </ActionLabel>
                  </Action>
                </Card>
              );
            })
          : null}

        {tab === "papers" ? (
          <>
            {/* A real switch, wired to a real reminder. It is off by
                default and it says what it costs: the dates leave the phone
                so that something on a server can watch the calendar. */}
            <ToggleRow onPress={toggleReminders} disabled={!user}>
              <ToggleCol>
                <ToggleTitle>{t("papersRemindTitle")}</ToggleTitle>
                <ToggleCopy>
                  {asking
                    ? t("papersRemindAsking")
                    : !user
                      ? t("papersRemindSignedOut")
                      : !hasExpiries
                        ? t("papersRemindNoDates")
                        : remindersOn
                          ? t("papersRemindOnCopy")
                          : t("papersRemindOffCopy")}
                </ToggleCopy>
              </ToggleCol>
              <Track
                on={remindersOn}
                dark={scheme === "dark"}
                disabled={!canRemind}
              >
                <Knob on={remindersOn} disabled={!canRemind} />
              </Track>
            </ToggleRow>

            <Note>
              <Ionicons
                name="information-circle-outline"
                size={15}
                color={colors.textMuted}
              />
              <NoteText>{t("papersNoAlertsNote")}</NoteText>
            </Note>

            <PrivacyNote>
              <Ionicons name="lock-closed-outline" size={15} color={NAVY} />
              <PrivacyText>
                {remindersOn
                  ? t("papersPrivacyShared")
                  : t("papersPrivacyNote")}
              </PrivacyText>
            </PrivacyNote>
          </>
        ) : null}

        {tab === "steps" ? (
          <>
            {/* The caveat goes above the lists, not below. Underneath, it is
                a footnote nobody reaches until after they have already
                treated the list as official. */}
            <Caveat>
              <Ionicons name="alert-circle-outline" size={15} color="#8a6415" />
              <CaveatText>{t("papersStepsCaveat")}</CaveatText>
            </Caveat>

            {paperProcedures.map((item) => {
              const open = openProcedure === item.key;
              const warn = language === "en" ? item.warnEn : item.warnFr;
              return (
                <Procedure
                  key={item.key}
                  open={open}
                  onPress={() => setOpenProcedure(open ? null : item.key)}
                >
                  <ProcedureTop>
                    <CardIcon bg="rgba(31,58,95,0.07)">
                      <Ionicons name={item.icon} size={20} color={NAVY} />
                    </CardIcon>
                    <CardCol>
                      <CardTitle>
                        {language === "en" ? item.labelEn : item.labelFr}
                      </CardTitle>
                      <CardMeta numberOfLines={2}>
                        {language === "en" ? item.whyEn : item.whyFr}
                      </CardMeta>
                    </CardCol>
                    <Ionicons
                      name={open ? "chevron-down" : "chevron-forward"}
                      size={18}
                      color={open ? NAVY : colors.textMuted}
                    />
                  </ProcedureTop>

                  {open ? (
                    <ProcedureBody>
                      {(language === "en" ? item.itemsEn : item.itemsFr).map(
                        (line) => (
                          <ItemRow key={line}>
                            <Ionicons name="checkmark" size={14} color={NAVY} />
                            <ItemText>{line}</ItemText>
                          </ItemRow>
                        ),
                      )}
                      {warn ? (
                        <ProcedureWarn>
                          <Ionicons
                            name="alert-circle-outline"
                            size={14}
                            color="#8a6415"
                          />
                          <ProcedureWarnText>{warn}</ProcedureWarnText>
                        </ProcedureWarn>
                      ) : null}
                    </ProcedureBody>
                  ) : null}
                </Procedure>
              );
            })}
          </>
        ) : null}

        {tab === "where" ? (
          <>
            {/* Kinds of place, and a search handed to the map. Naming
                offices would mean inventing their hours, and somebody
                drives across town on those. */}
            <Caveat>
              <Ionicons name="map-outline" size={15} color="#8a6415" />
              <CaveatText>{t("papersWhereCaveat")}</CaveatText>
            </Caveat>

            {paperPlaces.map((place) => (
              <Card key={place.key} onPress={() => openMapsFor(place)}>
                <CardIcon bg="rgba(31,58,95,0.07)">
                  <Ionicons name={place.icon} size={20} color={NAVY} />
                </CardIcon>
                <CardCol>
                  <CardTitle>
                    {language === "en" ? place.labelEn : place.labelFr}
                  </CardTitle>
                  <CardMeta numberOfLines={3}>
                    {language === "en" ? place.forEn : place.forFr}
                  </CardMeta>
                </CardCol>
                <Action urgent>
                  <ActionLabel urgent>{t("papersSearchMap")}</ActionLabel>
                </Action>
              </Card>
            ))}
          </>
        ) : null}
      </Scroll>

      <Modal
        visible={Boolean(editing)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <SheetBackdrop onPress={() => setEditing(null)}>
          <SheetLift behavior="padding">
            <Sheet
              bottomInset={insets.bottom}
              onStartShouldSetResponder={() => true}
            >
              <SheetHandle />
              <SheetTitle>
                {editing ? getPaperLabel(editing.key, language) : ""}
              </SheetTitle>
              <SheetCopy>{t("papersSheetCopy")}</SheetCopy>

              <DateRow>
                <DateField>
                  <DateLabel>{t("papersDay")}</DateLabel>
                  <DateInput
                    value={draft.day}
                    onChangeText={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        day: value.replace(/[^0-9]/g, "").slice(0, 2),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="01"
                    placeholderTextColor={colors.textMuted}
                  />
                </DateField>
                <DateField>
                  <DateLabel>{t("papersMonth")}</DateLabel>
                  <DateInput
                    value={draft.month}
                    onChangeText={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        month: value.replace(/[^0-9]/g, "").slice(0, 2),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="09"
                    placeholderTextColor={colors.textMuted}
                  />
                </DateField>
                <DateField wide>
                  <DateLabel>{t("papersYear")}</DateLabel>
                  <DateInput
                    value={draft.year}
                    onChangeText={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        year: value.replace(/[^0-9]/g, "").slice(0, 4),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="2027"
                    placeholderTextColor={colors.textMuted}
                  />
                </DateField>
              </DateRow>

              {/* Echoed back in words. Three number boxes are easy to fill in
                the wrong order, and a date is worth confirming before it
                starts driving a warning. */}
              {draftDate ? (
                <Echo>{formatDate(draftDate.toISOString())}</Echo>
              ) : (
                <EchoMuted>{t("papersDateHint")}</EchoMuted>
              )}

              <SaveButton onPress={saveDraft} disabled={!draftDate}>
                <SaveLabel>{t("papersSave")}</SaveLabel>
              </SaveButton>

              {editing && papers[editing.key] ? (
                <ClearButton onPress={clearDraft}>
                  <ClearLabel>{t("papersForget")}</ClearLabel>
                </ClearButton>
              ) : null}
            </Sheet>
          </SheetLift>
        </SheetBackdrop>
      </Modal>
      <Modal
        visible={vehicleOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setVehicleOpen(false)}
      >
        <SheetBackdrop onPress={() => setVehicleOpen(false)}>
          <SheetLift behavior="padding">
            <Sheet
              bottomInset={insets.bottom}
              onStartShouldSetResponder={() => true}
            >
              <SheetHandle />
              <SheetTitle>{t("papersVehicleTitle")}</SheetTitle>
              <SheetCopy>{t("papersVehicleCopy")}</SheetCopy>
              <VehicleInput
                value={vehicleDraft}
                onChangeText={setVehicleDraft}
                placeholder={t("papersVehiclePlaceholder")}
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                autoFocus
              />
              <SaveButton
                onPress={() => {
                  rememberVehicle(vehicleDraft);
                  setVehicleOpen(false);
                }}
              >
                <SaveLabel>{t("papersSave")}</SaveLabel>
              </SaveButton>
            </Sheet>
          </SheetLift>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

// Curved at the base like every other header in the app. Nothing straddles
// this one: what follows is the list of papers themselves, and they are the
// content rather than a control that governs it.
const Hero = styled(LinearGradient)`
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  /* 54px, against the dock's -30px lift: 24px of clear air under the
     vehicle pill, matching every other vehicle banner. */
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px 54px;
`;

const HeroGlow = styled.View`
  position: absolute;
  top: -140px;
  right: -80px;
  width: 260px;
  height: 260px;
  border-radius: 130px;
  background-color: rgba(140, 180, 240, 0.16);
`;

const HeroTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.14);
`;

const HeroEyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  color: #ffffff;
  margin-bottom: 7px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  max-width: 300px;
  color: rgba(255, 255, 255, 0.72);
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const TabDock = styled.View`
  z-index: 2;
  margin-top: -30px;
  padding: 0px ${spacing.md}px;
`;

const TabRow = styled.View`
  flex-direction: row;
  gap: 4px;
  padding: 5px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const Tab = styled(Pressable)`
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 8px 6px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.active ? NAVY : "transparent")};
`;

const TabLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => (props.active ? "#ffffff" : props.theme.textMuted)};
`;

const Caveat = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.1);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.28);
  margin-bottom: 13px;
`;

const CaveatText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #6b5a2e;
`;

const Procedure = styled(Pressable)`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: ${(props) => (props.open ? 1.5 : 1)}px;
  border-color: ${(props) =>
    props.open ? "rgba(31,58,95,0.3)" : props.theme.border};
  margin-bottom: 11px;
  ${shadow.card}
`;

const ProcedureTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 13px;
`;

const ProcedureBody = styled.View`
  gap: 9px;
  margin-top: 13px;
  padding-top: 13px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const ItemRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
`;

const ItemText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.text};
`;

const ProcedureWarn = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  margin-top: 4px;
  padding: 12px 13px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.09);
  border-width: 1px;
  border-color: rgba(217, 164, 65, 0.26);
`;

const ProcedureWarnText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: #7a5a12;
`;

const VehicleRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  margin-top: 14px;
  padding: 8px 13px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.12);
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.2);
`;

const VehicleLabel = styled.Text`
  max-width: 220px;
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const VehicleInput = styled.TextInput`
  min-height: 56px;
  padding: 0px 15px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const ToggleRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 13px;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  margin-top: 4px;
  margin-bottom: 11px;
  opacity: ${(props) => (props.disabled ? 0.6 : 1)};
  ${shadow.card}
`;

const ToggleCol = styled.View`
  flex: 1;
  gap: 4px;
`;

const ToggleTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const ToggleCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const Track = styled.View`
  width: 46px;
  height: 28px;
  border-radius: 999px;
  padding: 3px;
  flex-direction: row;
  justify-content: ${(props) => (props.on ? "flex-end" : "flex-start")};
  background-color: ${(props) =>
    props.on ? (props.dark ? NAVY_LIT : NAVY) : props.theme.border};
  /* Off and unusable are different states and have to look different, or a
     switch that cannot move reads as a switch that is broken. */
  border-width: ${(props) => (props.disabled ? 1 : 0)}px;
  border-color: ${(props) => props.theme.border};
  opacity: ${(props) => (props.disabled ? 0.55 : 1)};
`;

const Knob = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background-color: ${(props) =>
    props.disabled ? props.theme.textMuted : "#ffffff"};
`;

const Card = styled(Pressable)`
  flex-direction: row;
  align-items: flex-start;
  gap: 13px;
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) =>
    props.urgent ? "rgba(193,81,45,0.28)" : props.theme.border};
  margin-bottom: 11px;
  ${shadow.card}
`;

const CardIcon = styled.View`
  width: 42px;
  height: 42px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.bg};
`;

const CardCol = styled.View`
  flex: 1;
  gap: 6px;
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const StatusPill = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background-color: ${(props) => props.bg};
`;

const StatusDot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(props) => props.color};
`;

const StatusLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10.5px;
  color: ${(props) => props.fg};
`;

const CardMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  color: ${(props) => props.theme.textMuted};
`;

const Action = styled.View`
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: 999px;
  background-color: ${(props) => (props.urgent ? NAVY : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.urgent ? NAVY : "rgba(31,58,95,0.22)")};
`;

const ActionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => (props.urgent ? "#ffffff" : NAVY)};
`;

const Note = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-top: 4px;
  margin-bottom: 11px;
`;

const NoteText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${(props) => props.theme.textMuted};
`;

const PrivacyNote = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 14px 15px;
  border-radius: ${radius.lg}px;
  background-color: rgba(31, 58, 95, 0.06);
  border-width: 1px;
  border-color: rgba(31, 58, 95, 0.18);
`;

const PrivacyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  color: ${NAVY};
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.35);
`;

// The keyboard covers the bottom of a bottom sheet, which is exactly where
// the save button is — the sheet has to be lifted clear of it or the reader
// types a date and then cannot reach the button that keeps it.
//
// "padding" on both platforms, deliberately. The app is built with
// adjustPan (app.json: softwareKeyboardLayoutMode "pan"), so the Android
// window never resizes and "height" measures a box that has not changed —
// it shrinks the sheet to nothing and leaves it behind the keyboard.
const SheetLift = styled(KeyboardAvoidingView)`
  flex: 1;
  justify-content: flex-end;
`;

const Sheet = styled.View`
  /* Plus the gesture bar, which otherwise sits on top of the last button. */
  padding: 10px ${spacing.md}px
    ${(props) => spacing.xl + (props.bottomInset ?? 0)}px;
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  background-color: ${(props) => props.theme.background};
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  background-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 18px;
  color: ${(props) => props.theme.text};
  margin-bottom: 6px;
`;

const SheetCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.md}px;
`;

const DateRow = styled.View`
  flex-direction: row;
  gap: 10px;
`;

const DateField = styled.View`
  flex: ${(props) => (props.wide ? 1.4 : 1)};
  gap: 6px;
`;

const DateLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 10px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: ${(props) => props.theme.textMuted};
`;

const DateInput = styled.TextInput`
  min-height: 56px;
  padding: 0px 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  font-family: ${fontFamily.bold};
  font-size: 19px;
  text-align: center;
  color: ${(props) => props.theme.text};
`;

const Echo = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  text-align: center;
  color: ${NAVY};
  margin-top: 14px;
`;

const EchoMuted = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
  margin-top: 14px;
`;

const SaveButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  min-height: 52px;
  margin-top: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => (props.disabled ? "#9CA3AF" : NAVY)};
`;

const SaveLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const ClearButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  min-height: 46px;
  margin-top: ${spacing.sm}px;
`;

const ClearLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${TERRACOTTA};
`;
