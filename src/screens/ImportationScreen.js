import { useMemo, useState } from "react";
import { Linking, Modal, Pressable } from "react-native";
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
import { openAccountGate } from "../utils/openAccountGate";
import { canPublish } from "../utils/canPublish";
import { useAccountGateIntent } from "../hooks/useAccountGateIntent";
import { useCurrentLocation } from "../hooks/useCurrentLocation";
import { useImportHelpers } from "../hooks/useImportHelpers";
import {
  documentsFor,
  getSourcerOfferLabel,
  getTransitaireScopeLabel,
  importCargoKinds,
  importStages,
  roleLeadsAt,
  rolesForStage,
  storageClockRuns,
} from "../data/importation";

// The sea, because everything on this screen arrives by it.
const SEA = "#2C7FA6";
// The same blue dark enough to read as text on its own tint — the pattern
// AirconScreen's ICE/ICE_INK pair established, and for the same measured
// reason rather than by imitation.
const SEA_INK = "#25708F";
const DEEP = "#123A52";
const AMBER_INK = "#8A6415";

// Importation.
//
// vehicles.js says customs status is the single most consequential fact about
// a used car here, and every listing carries the badge that follows: "Non
// dédouané — droits restant à payer par l'acheteur, en plus du prix." The app
// has been stating a large unknown cost and then leaving the reader alone
// with it. This screen is the missing half.
//
// It answers a person, not a number. See the note at the top of
// data/importation.js for why no figure appears here.
export function ImportationScreen({ navigation }) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { coords } = useCurrentLocation();

  // Asked first because it renames the vocabulary of every stage below it.
  const [cargo, setCargo] = useState("vehicle");
  // Nothing preselected. A stage chosen for the reader is a guess about where
  // their shipment is, and the whole screen answers a different question
  // depending on it — better to show the four and let them say.
  const [stage, setStage] = useState(null);

  const { brokers, sourcers } = useImportHelpers(coords);
  const label = (item, base) =>
    language === "en" ? item[`${base}En`] : item[`${base}Fr`];
  const title = (item) =>
    (language === "en" ? item.titleEn : item.titleFr) || item.titleFr;

  const documents = useMemo(() => documentsFor(cargo), [cargo]);

  // A broker who declared nothing is shown to everybody. Silence is not a
  // refusal — see transitaireScopesFor — and hiding them would shrink an
  // already small list for a reason the reader cannot see.
  const matchingBrokers = useMemo(
    () =>
      brokers.filter(
        (item) =>
          item.scopes.length === 0 ||
          item.scopes.includes(cargo) ||
          item.scopes.includes("groupage"),
      ),
    [brokers, cargo],
  );

  // Which of the two lists leads. Somebody who has not bought anything yet
  // has no use for a transitaire, and somebody whose container is on the
  // quay has no use for a man in Antwerp — so the stage decides the order
  // rather than the alphabet.
  const roles = useMemo(() => rolesForStage(stage), [stage]);

  // Two trades, and the door has to open on the right one. A diaspora
  // importer sent to the transitaire form would be asked a broker's
  // questions, which is the exact failure check-post-trades.js exists for.
  const [postTrade, setPostTrade] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  const openPostForm = () =>
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade: postTrade ?? "transitaire",
    });

  const { remember } = useAccountGateIntent(user, openPostForm);
  const mayPublish = !user || canPublish(user);

  const startPosting = (trade) => {
    setPostTrade(trade);
    setChooserOpen(false);
    if (!user) {
      remember();
      openAccountGate(navigation);
      return;
    }
    navigation.navigate("CreateListing", {
      categoryKey: "services",
      trade,
    });
  };

  const call = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const activeStage = importStages.find((item) => item.key === stage) ?? null;

  return (
    <Container edges={["left", "right"]}>
      <Hero
        topInset={insets.top}
        colors={["#3E9BC4", SEA, DEEP]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      >
        <HeroTop>
          <BackButton onPress={() => navigation.goBack()} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color="#ffffff" />
          </BackButton>
          <Eyebrow>{t("importEyebrow")}</Eyebrow>
        </HeroTop>
        <HeroTitle>{t("importTitle")}</HeroTitle>
        <HeroCopy>{t("importIntro")}</HeroCopy>

        {/* In the hero, which does not scroll — the placement rule every
            vertical here now follows. A transitaire arriving at a screen
            with a full list would otherwise have no door at all. */}
        {mayPublish ? (
          <HeroPostBar onPress={() => setChooserOpen(true)}>
            <HeroPostDisc>
              <Ionicons name="briefcase" size={15} color={DEEP} />
            </HeroPostDisc>
            <HeroPostLabel numberOfLines={1}>
              {t("importPostPrompt")}
            </HeroPostLabel>
            <HeroPostCta>
              <HeroPostCtaLabel>{t("importPost")}</HeroPostCtaLabel>
            </HeroPostCta>
          </HeroPostBar>
        ) : null}
      </Hero>

      <Scroll
        contentContainerStyle={{
          padding: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Said before anything else, because it is what the reader came for
            and the honest answer is that this screen will not give them a
            figure. Better at the top, where it sets expectations, than
            discovered at the bottom after a scroll spent looking for one. */}
        <Truth>
          <TruthIcon>
            <Ionicons name="information-circle" size={18} color={SEA} />
          </TruthIcon>
          <TruthCol>
            <TruthTitle>{t("importNoFigureTitle")}</TruthTitle>
            <TruthCopy>{t("importNoFigureCopy")}</TruthCopy>
          </TruthCol>
        </Truth>

        {/* What replaced the age cap that used to sit here.
        
            That one claimed a vehicle over seven years old could not be
            imported, which is not a rule in Bénin — the port's used-car
            trade runs on exactly that stock. This is a rule, and unlike a
            tariff it is about sequence rather than amount, so it cannot go
            out of date the way a rate does.
        
            Gated on the stages where it can still be acted on. Telling
            somebody whose container is already on the quay that they should
            have opened it before departure is not advice, it is salt. */}
        {!stage || stage === "notShipped" || stage === "atSea" ? (
          <Rule>
            <RuleIcon>
              <Ionicons name="alert-circle" size={18} color={AMBER_INK} />
            </RuleIcon>
            <RuleCol>
              <RuleTitle>{t("importBescTitle")}</RuleTitle>
              <RuleCopy>{t("importBescCopy")}</RuleCopy>
            </RuleCol>
          </Rule>
        ) : null}

        <SectionTitle>{t("importCargoTitle")}</SectionTitle>
        <CargoRow>
          {importCargoKinds.map((kind) => {
            const on = kind.key === cargo;
            return (
              <CargoChip
                key={kind.key}
                on={on}
                onPress={() => setCargo(kind.key)}
              >
                <Ionicons
                  name={kind.icon}
                  size={17}
                  color={on ? "#ffffff" : SEA_INK}
                />
                <CargoLabel on={on}>{label(kind, "label")}</CargoLabel>
              </CargoChip>
            );
          })}
        </CargoRow>

        <SectionTitle>{t("importStageTitle")}</SectionTitle>
        {importStages.map((item) => {
          const on = item.key === stage;
          return (
            <StageCard
              key={item.key}
              on={on}
              tone={item.color}
              onPress={() => setStage(on ? null : item.key)}
            >
              <StageIcon tone={item.color}>
                <Ionicons name={item.icon} size={17} color={item.color} />
              </StageIcon>
              <StageCol>
                <StageLabel>{label(item, "label")}</StageLabel>
                <StageHint>{label(item, "hint")}</StageHint>
              </StageCol>
              <Ionicons
                name={on ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.textMuted}
              />
            </StageCard>
          );
        })}

        {/* The clock, and only where it is actually running. On every stage
            it would be wallpaper, and wallpaper is not a warning. */}
        {activeStage && storageClockRuns(activeStage.key) ? (
          <Clock>
            <ClockTop>
              <Ionicons name="time-outline" size={17} color={AMBER_INK} />
              <ClockTitle>{t("importClockTitle")}</ClockTitle>
            </ClockTop>
            <ClockCopy>{t("importClockCopy")}</ClockCopy>
          </Clock>
        ) : null}

        <SectionTitle>{t("importPapersTitle")}</SectionTitle>
        <PapersNote>{t("importPapersNote")}</PapersNote>
        <PaperList>
          {documents.map((doc) => (
            <PaperRow key={doc.key}>
              <PaperIcon>
                <Ionicons name="document-text-outline" size={15} color={SEA} />
              </PaperIcon>
              <PaperCol>
                <PaperLabel>{label(doc, "label")}</PaperLabel>
                <PaperHint>{label(doc, "hint")}</PaperHint>
              </PaperCol>
            </PaperRow>
          ))}
        </PaperList>

        {/* The two lists, in the order the reader's stage decides. The one
            they need leads and says why; the other still appears, because a
            stage is a guess about somebody's situation and being wrong
            about it should cost a scroll, not the whole answer. */}
        {roles.map((role) => {
          const leads = roleLeadsAt(role.key, stage);
          const items = role.key === "broker" ? matchingBrokers : sourcers;
          return (
            <RoleBlock key={role.key}>
              <SectionTitle>
                {language === "en" ? role.labelEn : role.labelFr}
              </SectionTitle>
              {leads ? (
                <LeadNote>
                  <Ionicons name="arrow-forward" size={13} color={SEA_INK} />
                  <LeadText>{t(`importLead_${role.key}`)}</LeadText>
                </LeadNote>
              ) : null}
              <CountRow>
                <CountText>
                  {t("importHelperCount", { count: items.length })}
                </CountText>
              </CountRow>

              {items.length === 0 ? (
                <Empty>
                  <EmptyTitle>{t("importBrokerEmptyTitle")}</EmptyTitle>
                  <EmptyCopy>{t("importBrokerEmptyCopy")}</EmptyCopy>
                </Empty>
              ) : null}

              {items.map((item) => (
                <Card key={item.id}>
                  <CardTitle numberOfLines={2}>{title(item)}</CardTitle>
                  <MetaRow>
                    {/* A broker is somewhere you go, so the distance is the
                        useful fact. A sourcer is somewhere you do not go, so
                        the country they buy FROM is — and printing a
                        Cotonou distance beside a man in Antwerp would be
                        describing the wrong place entirely. */}
                    {role.key === "sourcer" ? (
                      item.buysFrom ? (
                        <MetaItem>
                          <Ionicons
                            name="airplane-outline"
                            size={11}
                            color={colors.textMuted}
                          />
                          <MetaText numberOfLines={1}>
                            {t("importBuysFrom", { country: item.buysFrom })}
                          </MetaText>
                        </MetaItem>
                      ) : null
                    ) : item.city ? (
                      <MetaItem>
                        <Ionicons
                          name="location-outline"
                          size={11}
                          color={colors.textMuted}
                        />
                        <MetaText numberOfLines={1}>
                          {item.distanceKm != null
                            ? `${item.city} · ${item.distanceKm.toFixed(1)} km`
                            : item.city}
                        </MetaText>
                      </MetaItem>
                    ) : null}
                  </MetaRow>

                  {role.key === "sourcer" ? (
                    item.offers.length ? (
                      <ScopeRow>
                        {item.offers.map((key) => (
                          <ScopePill key={key}>
                            <ScopeLabel>
                              {getSourcerOfferLabel(key, language)}
                            </ScopeLabel>
                          </ScopePill>
                        ))}
                      </ScopeRow>
                    ) : (
                      <ScopeUnknown>{t("importOfferUnknown")}</ScopeUnknown>
                    )
                  ) : item.scopes.length ? (
                    <ScopeRow>
                      {item.scopes.map((key) => (
                        <ScopePill key={key}>
                          <ScopeLabel>
                            {getTransitaireScopeLabel(key, language)}
                          </ScopeLabel>
                        </ScopePill>
                      ))}
                    </ScopeRow>
                  ) : (
                    // Not a gap to fill with a guess: they did not say, so
                    // the screen says they did not say.
                    <ScopeUnknown>{t("importScopeUnknown")}</ScopeUnknown>
                  )}

                  {item.phone ? (
                    <CallButton onPress={() => call(item.phone)}>
                      <Ionicons name="call" size={15} color="#ffffff" />
                      <CallLabel>{t("importCall")}</CallLabel>
                    </CallButton>
                  ) : null}
                </Card>
              ))}
            </RoleBlock>
          );
        })}
      </Scroll>

      {/* Two trades behind one door. The invitation stays in the hero, where
          it does not vanish as the lists fill, and the question of which
          kind of importer you are is asked here rather than guessed from
          the stage the reader happened to tap. */}
      <Modal
        visible={chooserOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setChooserOpen(false)}
      >
        <SheetBackdrop onPress={() => setChooserOpen(false)}>
          <Sheet
            onStartShouldSetResponder={() => true}
            bottomInset={insets.bottom}
          >
            <SheetHandle />
            <SheetTitle>{t("importChooserTitle")}</SheetTitle>
            <SheetCopy>{t("importChooserCopy")}</SheetCopy>
            <SheetRow onPress={() => startPosting("transitaire")}>
              <SheetIcon>
                <Ionicons name="boat-outline" size={18} color={SEA} />
              </SheetIcon>
              <SheetRowCol>
                <SheetRowLabel>{t("importChooserBroker")}</SheetRowLabel>
                <SheetRowHint>{t("importChooserBrokerHint")}</SheetRowHint>
              </SheetRowCol>
              <Ionicons
                name="chevron-forward"
                size={15}
                color={colors.textMuted}
              />
            </SheetRow>
            <SheetRow onPress={() => startPosting("importateur")}>
              <SheetIcon>
                <Ionicons name="airplane-outline" size={18} color={SEA} />
              </SheetIcon>
              <SheetRowCol>
                <SheetRowLabel>{t("importChooserSourcer")}</SheetRowLabel>
                <SheetRowHint>{t("importChooserSourcerHint")}</SheetRowHint>
              </SheetRowCol>
              <Ionicons
                name="chevron-forward"
                size={15}
                color={colors.textMuted}
              />
            </SheetRow>
            {/* Said here, to the one person it stops.
            
                Publishing is +229-only and stays that way — firestore.rules
                gates it on a claim set from a number Firebase itself
                verified by SMS, because an unreachable seller is where the
                scams start. That rule bites hardest on exactly the reader
                this row is addressed to: somebody in Brussels with a
                Belgian handset.
            
                They will hit it either way. The choice is whether they hit
                it now, in one line, or after signing up and filling in a
                form — and a requirement discovered at the end reads as the
                app breaking rather than as a rule. */}
            <SheetFoot>{t("importChooserPhoneNote")}</SheetFoot>
          </Sheet>
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
  overflow: hidden;
  border-bottom-left-radius: 28px;
  border-bottom-right-radius: 28px;
  padding: ${(props) => props.topInset + spacing.sm}px ${spacing.md}px
    ${spacing.lg}px;
`;

const HeroTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.md}px;
`;

const BackButton = styled.Pressable`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.18);
`;

const Eyebrow = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  letter-spacing: 1.4px;
  color: rgba(255, 255, 255, 0.85);
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 25px;
  line-height: 30px;
  color: #ffffff;
  margin-bottom: 8px;
`;

const HeroCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13.5px;
  line-height: 19px;
  color: rgba(255, 255, 255, 0.9);
`;

// A solid white bar rather than the translucent one this started as. Two
// reasons, and only the first was visible: white-on-white between the disc
// and its label is 1.00:1, which check-contrast.js caught and no amount of
// looking at it over a dark gradient would have. The second is that a ghost
// bar reads as a caption, and this is the only way a transitaire ever joins
// the list. Same construction as the Climatisation hero, which was measured.
const HeroPostBar = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-top: ${spacing.md}px;
  padding: 7px 7px 7px 9px;
  border-radius: ${radius.pill}px;
  background-color: #ffffff;
`;

const HeroPostDisc = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  background-color: rgba(18, 58, 82, 0.12);
`;

const HeroPostLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${DEEP};
`;

const HeroPostCta = styled.View`
  padding: 7px 14px;
  border-radius: ${radius.pill}px;
  background-color: ${DEEP};
`;

const HeroPostCtaLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: #ffffff;
`;

const Scroll = styled.ScrollView`
  flex: 1;
`;

const Truth = styled.View`
  flex-direction: row;
  gap: 10px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const TruthIcon = styled.View`
  margin-top: 1px;
`;

const TruthCol = styled.View`
  flex: 1;
`;

const TruthTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: 3px;
`;

const TruthCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
  margin-bottom: 12px;
`;

const CargoRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
`;

const CargoChip = styled.Pressable`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px 10px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.on ? SEA : props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => (props.on ? SEA : props.theme.border)};
`;

const CargoLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => (props.on ? "#ffffff" : props.theme.text)};
`;

const StageCard = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: 11px;
  padding: 13px ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: ${(props) => (props.on ? 2 : 1)}px;
  border-color: ${(props) => (props.on ? props.tone : props.theme.border)};
`;

const StageIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => `${props.tone}1F`};
`;

const StageCol = styled.View`
  flex: 1;
`;

const StageLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const StageHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const Clock = styled.View`
  padding: ${spacing.md}px;
  margin-top: 2px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.14);
`;

const ClockTop = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 7px;
  margin-bottom: 5px;
`;

const ClockTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${AMBER_INK};
`;

const ClockCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${AMBER_INK};
`;

const PapersNote = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  margin-top: -6px;
  margin-bottom: 10px;
  color: ${(props) => props.theme.textMuted};
`;

const PaperList = styled.View`
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  overflow: hidden;
`;

const PaperRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  padding: 12px ${spacing.md}px;
`;

const PaperIcon = styled.View`
  margin-top: 1px;
`;

const PaperCol = styled.View`
  flex: 1;
`;

const PaperLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.text};
`;

const PaperHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const CountRow = styled.View`
  margin-top: -6px;
  margin-bottom: 10px;
`;

const CountText = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Empty = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
`;

const EmptyTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: 4px;
`;

const EmptyCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${(props) => props.theme.textMuted};
`;

const Card = styled.View`
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  ${shadow.card}
`;

const CardTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-top: 5px;
`;

const MetaItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 1;
`;

const MetaText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  color: ${(props) => props.theme.textMuted};
`;

const ScopeRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
`;

const ScopePill = styled.View`
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  background-color: rgba(44, 127, 166, 0.12);
`;

const ScopeLabel = styled.Text`
  font-family: ${fontFamily.medium};
  font-size: 11.5px;
  color: ${SEA_INK};
`;

const ScopeUnknown = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  margin-top: 9px;
  color: ${(props) => props.theme.textMuted};
`;

const CallButton = styled.Pressable`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 11px;
  padding: 10px;
  border-radius: ${radius.pill}px;
  background-color: ${SEA_INK};
`;

const CallLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: #ffffff;
`;

const RoleBlock = styled.View``;

const LeadNote = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: -6px;
  margin-bottom: 8px;
`;

const LeadText = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 12.5px;
  line-height: 18px;
  color: ${SEA_INK};
`;






const SheetBackdrop = styled.Pressable`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View`
  padding: ${spacing.sm}px ${spacing.md}px
    ${(props) => props.bottomInset + spacing.md}px;
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  background-color: ${(props) => props.theme.surface};
`;

const SheetHandle = styled.View`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const SheetCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  margin: 5px 0 ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;

const SheetRow = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: 11px;
  padding: 12px 0;
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const SheetIcon = styled.View`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: rgba(44, 127, 166, 0.12);
`;

const SheetRowCol = styled.View`
  flex: 1;
`;

const SheetRowLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14px;
  color: ${(props) => props.theme.text};
`;

const SheetRowHint = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
  color: ${(props) => props.theme.textMuted};
`;

const Rule = styled.View`
  flex-direction: row;
  gap: 10px;
  margin-top: ${spacing.md}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(217, 164, 65, 0.14);
`;

const RuleIcon = styled.View`
  margin-top: 1px;
`;

const RuleCol = styled.View`
  flex: 1;
`;

const RuleTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 14px;
  color: ${AMBER_INK};
  margin-bottom: 3px;
`;

const RuleCopy = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12.5px;
  line-height: 18px;
  color: ${AMBER_INK};
`;

const SheetFoot = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11.5px;
  line-height: 16px;
  margin-top: ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
`;
