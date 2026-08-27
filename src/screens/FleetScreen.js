import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useFleet } from "../hooks/useFleet";
import { paperKinds } from "../data/vehiclePapers";
import {
  fleetDue,
  fleetSummary,
  isUsableVehicle,
  makeVehicle,
  vehicleDue,
  vehicleWorst,
} from "../data/fleet";

// Graphite, and on purpose almost colourless.
//
// Every other vehicle screen is branded by a hue because it is selling a
// trade: brass for keys, ice for air conditioning, slate for tracking. This
// one sells nothing. It is a list of what is late, and the only colours that
// should carry meaning on it are the three that say how late — red, amber,
// green. A branded hero would put a fourth colour in competition with them.
const GRAPHITE = "#39414A";
const GRAPHITE_INK = "#2C333B";
const MIDNIGHT = "#171C21";
const TERRACOTTA = "#C1512D";
const AMBER = "#8A5F1F";

// Gestion de flotte.
//
// The tile ran a text search of Services for "gestion de flotte", which is
// the wrong shape entirely: there is no provider to find. Somebody running
// four taxis does not need a fleet-management company, they need to know
// which of the four has an insurance that lapsed last week.
//
// So this screen holds the owner's own records and nothing else. It starts
// empty — a fleet dashboard shipped with example vehicles in it would be
// inventing a business — and every date on it was typed by the person
// reading it. The arithmetic is the same one Papiers & contrôle already
// uses, on several vehicles instead of one.
export function FleetScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();

  const { vehicles, papers, loaded, addVehicle, removeVehicle, rememberDate } =
    useFleet();

  const [tab, setTab] = useState("due");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", plate: "", driver: "" });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ day: "", month: "", year: "" });

  // Midnight today, so a paper expiring today reads as due rather than as
  // expired by a few hours. The same boundary the papers screen uses.
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const due = useMemo(
    () => fleetDue(vehicles, papers, today),
    [vehicles, papers, today],
  );
  const summary = useMemo(
    () => fleetSummary(vehicles, papers, today),
    [vehicles, papers, today],
  );

  const label = (item, key) =>
    language === "en" ? item[`${key}En`] : item[`${key}Fr`];

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  // Same validation as the papers screen, including the 31 February case:
  // JavaScript rolls that into March and would show a date nobody typed.
  const draftDate = useMemo(() => {
    const day = Number(draft.day);
    const month = Number(draft.month);
    const year = Number(draft.year);
    if (!day || !month || !year || String(year).length !== 4) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }, [draft]);

  const openDate = (vehicle, kind) => {
    const current = papers?.[vehicle.id]?.[kind.key];
    if (current) {
      const date = new Date(current);
      setDraft({
        day: String(date.getDate()),
        month: String(date.getMonth() + 1),
        year: String(date.getFullYear()),
      });
    } else {
      setDraft({ day: "", month: "", year: "" });
    }
    setEditing({ vehicle, kind });
  };

  const saveDraft = () => {
    if (!draftDate || !editing) return;
    rememberDate(editing.vehicle.id, editing.kind.key, draftDate.toISOString());
    setEditing(null);
  };

  const clearDraft = () => {
    if (!editing) return;
    rememberDate(editing.vehicle.id, editing.kind.key, null);
    setEditing(null);
  };

  const submitVehicle = () => {
    // The id is the clock, which is enough for a list one person types on
    // one device, and avoids pulling in a uuid dependency for it.
    const vehicle = makeVehicle(
      `v${Date.now()}`,
      form.name,
      form.plate,
      form.driver,
    );
    if (!isUsableVehicle(vehicle)) return;
    addVehicle(vehicle);
    setForm({ name: "", plate: "", driver: "" });
    setAdding(false);
  };

  const statusLine = (status) => {
    if (status.state === "expired") {
      return t("fleetExpired", { days: -status.days });
    }
    if (status.state === "soon") return t("fleetSoon", { days: status.days });
    if (status.state === "valid") return t("fleetValid");
    return t("fleetUnknown");
  };

  const toneOf = (state) =>
    state === "expired" ? TERRACOTTA : state === "soon" ? AMBER : GRAPHITE;

  const empty = loaded && vehicles.length === 0;

  return (
    <Container edges={["left", "right"]}>
      <Hero
        topInset={insets.top}
        colors={["#4A535E", GRAPHITE, MIDNIGHT]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <Eyebrow>{t("fleetEyebrow")}</Eyebrow>
        </HeroTop>
        <HeroTitle>{t("fleetTitle")}</HeroTitle>
        <HeroCopy>{t("fleetIntro")}</HeroCopy>
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {empty ? (
          <>
            {/* Nothing invented. A fleet dashboard that opened with four
                example vehicles, their plates and their drivers would be
                fabricating a business, and the first thing the owner would
                have to do is work out which rows were real. */}
            <EmptyCard>
              <EmptyIcon>
                <Ionicons name="albums-outline" size={24} color={GRAPHITE} />
              </EmptyIcon>
              <EmptyTitle>{t("fleetEmptyTitle")}</EmptyTitle>
              <EmptyCopy>{t("fleetEmptyCopy")}</EmptyCopy>
            </EmptyCard>
            <AddButton onPress={() => setAdding(true)}>
              <Ionicons name="add" size={17} color="#ffffff" />
              <AddLabel>{t("fleetAdd")}</AddLabel>
            </AddButton>
          </>
        ) : (
          <>
            <StatRow>
              <Stat>
                <StatValue>{summary.vehicles}</StatValue>
                <StatLabel>{t("fleetStatVehicles")}</StatLabel>
              </Stat>
              <Stat>
                <StatValue tone={summary.expired ? TERRACOTTA : null}>
                  {summary.expired}
                </StatValue>
                <StatLabel>{t("fleetStatExpired")}</StatLabel>
              </Stat>
              {/* Counted, not claimed. The app knows how many dates it was
                  given; it cannot see a certificate, so "à jour" would be an
                  assertion about the world it has no way to make. */}
              <Stat>
                <StatValue>
                  {summary.known}/{summary.slots}
                </StatValue>
                <StatLabel>{t("fleetStatKnown")}</StatLabel>
              </Stat>
            </StatRow>

            <Segment>
              {[
                { key: "due", label: t("fleetTabDue") },
                { key: "vehicles", label: t("fleetTabVehicles") },
              ].map((item) => {
                const on = item.key === tab;
                return (
                  <SegmentItem
                    key={item.key}
                    on={on}
                    onPress={() => setTab(item.key)}
                  >
                    <SegmentLabel on={on}>{item.label}</SegmentLabel>
                  </SegmentItem>
                );
              })}
            </Segment>

            {tab === "due" ? (
              <>
                {due.length ? (
                  <>
                    <CountText>
                      {t("fleetDueCount", { count: due.length })}
                    </CountText>
                    {due.map((entry) => (
                      <DueRow
                        key={`${entry.vehicle.id}-${entry.kind.key}`}
                        tone={toneOf(entry.status.state)}
                        onPress={() => openDate(entry.vehicle, entry.kind)}
                      >
                        <Dot tone={toneOf(entry.status.state)} />
                        <DueCol>
                          <DueText tone={toneOf(entry.status.state)}>
                            {label(entry.kind, "label")} —{" "}
                            {statusLine(entry.status)}
                          </DueText>
                          <DueWho>
                            {[entry.vehicle.name, entry.vehicle.plate]
                              .filter(Boolean)
                              .join(" · ")}
                          </DueWho>
                          {entry.vehicle.driver ? (
                            <DueDriver>{entry.vehicle.driver}</DueDriver>
                          ) : null}
                        </DueCol>
                      </DueRow>
                    ))}
                    {/* The reason the order is what it is, said once. */}
                    <Note>{t("fleetDueOrder")}</Note>
                  </>
                ) : (
                  <EmptyCard>
                    <EmptyTitle>{t("fleetNothingDueTitle")}</EmptyTitle>
                    <EmptyCopy>{t("fleetNothingDueCopy")}</EmptyCopy>
                  </EmptyCard>
                )}
              </>
            ) : (
              <>
                {vehicles.map((vehicle) => {
                  const worst = vehicleWorst(vehicle, papers, today);
                  return (
                    <VehicleCard key={vehicle.id}>
                      <VehicleTop>
                        <VehicleCol>
                          <VehicleName>{vehicle.name}</VehicleName>
                          <VehicleMeta>
                            {[vehicle.plate, vehicle.driver]
                              .filter(Boolean)
                              .join(" · ") || t("fleetNoPlate")}
                          </VehicleMeta>
                        </VehicleCol>
                        <RemovePress onPress={() => removeVehicle(vehicle.id)}>
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={colors.textMuted}
                          />
                        </RemovePress>
                      </VehicleTop>

                      {worst ? (
                        <Worst tone={toneOf(worst.status.state)}>
                          <Dot tone={toneOf(worst.status.state)} />
                          <WorstText tone={toneOf(worst.status.state)}>
                            {label(worst.kind, "label")} —{" "}
                            {statusLine(worst.status)}
                          </WorstText>
                        </Worst>
                      ) : null}

                      {/* Every renewable paper, tappable. This is where a
                          date gets typed; the échéances tab only ever reads
                          them back. */}
                      <PaperList>
                        {vehicleDue(vehicle, papers, today).map((entry) => (
                          <PaperRow
                            key={entry.kind.key}
                            onPress={() => openDate(vehicle, entry.kind)}
                          >
                            <Ionicons
                              name={entry.kind.icon}
                              size={15}
                              color={toneOf(entry.status.state)}
                            />
                            <PaperLabel>
                              {label(entry.kind, "label")}
                            </PaperLabel>
                            <PaperValue tone={toneOf(entry.status.state)}>
                              {entry.value
                                ? formatDate(entry.value)
                                : t("fleetSetDate")}
                            </PaperValue>
                          </PaperRow>
                        ))}
                      </PaperList>
                    </VehicleCard>
                  );
                })}

                <AddButton onPress={() => setAdding(true)}>
                  <Ionicons name="add" size={17} color="#ffffff" />
                  <AddLabel>{t("fleetAdd")}</AddLabel>
                </AddButton>
              </>
            )}
          </>
        )}

        <Safety>
          <Ionicons name="shield-outline" size={15} color="#8a6415" />
          <SafetyText>{t("fleetSafety")}</SafetyText>
        </Safety>
      </Scroll>

      {/* ── Add a vehicle ────────────────────────────────────────────── */}
      <Modal
        visible={adding}
        transparent
        animationType="slide"
        onRequestClose={() => setAdding(false)}
      >
        <SheetBackdrop onPress={() => setAdding(false)}>
          <SheetLift behavior="padding">
            <Sheet
              bottomInset={insets.bottom}
              onStartShouldSetResponder={() => true}
            >
              <SheetHandle />
              <SheetTitle>{t("fleetAdd")}</SheetTitle>

              <FieldLabel>{t("fleetFieldName")}</FieldLabel>
              <Input
                value={form.name}
                onChangeText={(value) => setForm({ ...form, name: value })}
                placeholder={t("fleetFieldNamePlaceholder")}
                placeholderTextColor={colors.textMuted}
              />

              <FieldLabel>{t("fleetFieldPlate")}</FieldLabel>
              <Input
                value={form.plate}
                onChangeText={(value) => setForm({ ...form, plate: value })}
                placeholder={t("fleetFieldPlatePlaceholder")}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
              />

              <FieldLabel>{t("fleetFieldDriver")}</FieldLabel>
              <Input
                value={form.driver}
                onChangeText={(value) => setForm({ ...form, driver: value })}
                placeholder={t("fleetFieldDriverPlaceholder")}
                placeholderTextColor={colors.textMuted}
              />
              {/* Only the name is required: somebody with one taxi calls it
                "le taxi" and never types a plate, and a form that refuses
                them is a form they close. */}
              <Note>{t("fleetFieldNote")}</Note>

              <SaveButton onPress={submitVehicle} disabled={!form.name.trim()}>
                <SaveLabel>{t("fleetAddSave")}</SaveLabel>
              </SaveButton>
            </Sheet>
          </SheetLift>
        </SheetBackdrop>
      </Modal>

      {/* ── A date ───────────────────────────────────────────────────── */}
      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
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
                {editing
                  ? `${label(editing.kind, "label")} — ${editing.vehicle.name}`
                  : ""}
              </SheetTitle>

              <DateRow>
                <DateField>
                  <DateInput
                    value={draft.day}
                    onChangeText={(value) =>
                      setDraft({ ...draft, day: value.replace(/[^0-9]/g, "") })
                    }
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder={t("papersDay")}
                    placeholderTextColor={colors.textMuted}
                  />
                </DateField>
                <DateField>
                  <DateInput
                    value={draft.month}
                    onChangeText={(value) =>
                      setDraft({
                        ...draft,
                        month: value.replace(/[^0-9]/g, ""),
                      })
                    }
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder={t("papersMonth")}
                    placeholderTextColor={colors.textMuted}
                  />
                </DateField>
                <DateField wide>
                  <DateInput
                    value={draft.year}
                    onChangeText={(value) =>
                      setDraft({ ...draft, year: value.replace(/[^0-9]/g, "") })
                    }
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder={t("papersYear")}
                    placeholderTextColor={colors.textMuted}
                  />
                </DateField>
              </DateRow>

              {draftDate ? (
                <Echo>{formatDate(draftDate.toISOString())}</Echo>
              ) : null}

              <SaveButton onPress={saveDraft} disabled={!draftDate}>
                <SaveLabel>{t("papersSave")}</SaveLabel>
              </SaveButton>
              <ClearPress onPress={clearDraft}>
                <ClearLabel>{t("papersForget")}</ClearLabel>
              </ClearPress>
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

const Hero = styled(LinearGradient)`
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.lg}px;
  border-bottom-left-radius: ${radius.xl}px;
  border-bottom-right-radius: ${radius.xl}px;
`;

const HeroTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.16);
`;

const Eyebrow = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 11px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.72);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 26px;
  line-height: 32px;
  margin-bottom: 8px;
  color: #ffffff;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 20px;
  color: rgba(255, 255, 255, 0.8);
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const StatRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const Stat = styled.View`
  flex: 1;
  padding: 13px;
  border-radius: ${radius.lg}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const StatValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 21px;
  color: ${(props) => props.tone ?? props.theme.text};
`;

const StatLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 10.5px;
  margin-top: 3px;
  color: ${(props) => props.theme.textMuted};
`;

const Segment = styled.View`
  flex-direction: row;
  padding: 4px;
  border-radius: ${radius.lg}px;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const SegmentItem = styled(Pressable)`
  flex: 1;
  align-items: center;
  padding: 10px 6px;
  border-radius: ${radius.md}px;
  background-color: ${(props) =>
    props.on ? props.theme.surface : "transparent"};
`;

const SegmentLabel = styled.Text`
  font-family: ${(props) =>
    props.on ? fontFamily.semiBold : fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => (props.on ? props.theme.text : props.theme.textMuted)};
`;

const CountText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12px;
  margin-bottom: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const DueRow = styled(Pressable)`
  flex-direction: row;
  align-items: flex-start;
  gap: 11px;
  padding: 14px;
  border-radius: ${radius.lg}px;
  margin-bottom: 10px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const Dot = styled.View`
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 4px;
  background-color: ${(props) => props.tone};
`;

const DueCol = styled.View`
  flex: 1;
`;

const DueText = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  line-height: 18px;
  color: ${(props) => props.tone};
`;

const DueWho = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  margin-top: 3px;
  color: ${(props) => props.theme.text};
`;

const DueDriver = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  margin-top: 1px;
  color: ${(props) => props.theme.textMuted};
`;

const Note = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 17px;
  margin-top: 4px;
  margin-bottom: ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

const VehicleCard = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.xl}px;
  margin-bottom: ${spacing.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const VehicleTop = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
`;

const VehicleCol = styled.View`
  flex: 1;
`;

const VehicleName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const VehicleMeta = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const RemovePress = styled(Pressable)`
  padding: 4px;
`;

const Worst = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-top: 11px;
  padding: 9px 11px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const WorstText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 12px;
  color: ${(props) => props.tone};
`;

const PaperList = styled.View`
  margin-top: 11px;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const PaperRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 9px;
  padding-vertical: 10px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const PaperLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
`;

const PaperValue = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11.5px;
  color: ${(props) => props.tone};
`;

const EmptyCard = styled.View`
  align-items: center;
  padding: ${spacing.lg}px;
  border-radius: ${radius.xl}px;
  margin-bottom: ${spacing.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  background-color: ${(props) => props.theme.surface};
`;

const EmptyIcon = styled.View`
  width: 52px;
  height: 52px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.sm}px;
  background-color: rgba(57, 65, 74, 0.08);
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  text-align: center;
  margin-bottom: 6px;
  color: ${(props) => props.theme.text};
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 19px;
  text-align: center;
  color: ${(props) => props.theme.textMuted};
`;

const AddButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 14px;
  border-radius: ${radius.md}px;
  margin-bottom: ${spacing.md}px;
  background-color: ${GRAPHITE_INK};
`;

const AddLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
`;

const Safety = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 13px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.12);
`;

const SafetyText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 18px;
  color: #8a6415;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

// Without this the keyboard covers the fields it was opened to fill, and on
// the add-vehicle sheet it covers the button that saves them.
//
// "padding" on both platforms, deliberately, and for the reason the papers
// screen already writes down: the app runs adjustPan (app.json,
// softwareKeyboardLayoutMode "pan"), so the Android window never resizes and
// "height" measures a box that has not changed — it shrinks the sheet to
// nothing and leaves it behind the keyboard.
const SheetLift = styled(KeyboardAvoidingView)`
  flex: 1;
  justify-content: flex-end;
`;

const Sheet = styled.View`
  padding: ${spacing.md}px ${spacing.md}px
    ${(props) => spacing.xl + (props.bottomInset ?? 0)}px;
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  background-color: ${(props) => props.theme.surface};
`;

const SheetHandle = styled.View`
  width: 38px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  margin-bottom: ${spacing.md}px;
  color: ${(props) => props.theme.text};
`;

const FieldLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12px;
  margin-bottom: 6px;
  color: ${(props) => props.theme.textMuted};
`;

const Input = styled.TextInput`
  padding: 12px 13px;
  border-radius: ${radius.md}px;
  margin-bottom: ${spacing.sm}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.background};
`;

const DateRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
`;

const DateField = styled.View`
  flex: ${(props) => (props.wide ? 1.6 : 1)};
`;

const DateInput = styled.TextInput`
  padding: 12px 13px;
  border-radius: ${radius.md}px;
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  text-align: center;
  color: ${(props) => props.theme.text};
  background-color: ${(props) => props.theme.background};
`;

const Echo = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  text-align: center;
  margin-bottom: ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const SaveButton = styled(Pressable)`
  align-items: center;
  padding: 14px;
  border-radius: ${radius.md}px;
  margin-top: 4px;
  opacity: ${(props) => (props.disabled ? 0.45 : 1)};
  background-color: ${GRAPHITE_INK};
`;

const SaveLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: #ffffff;
`;

const ClearPress = styled(Pressable)`
  align-items: center;
  padding: 12px;
`;

const ClearLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;
