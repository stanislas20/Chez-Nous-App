import { useState } from "react";
import { Linking, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { SearchBar } from "../components/SearchBar";
import {
  banksReviewedOn,
  banksSource,
  beninBanks,
  bankSearchTerms,
  formerNames,
} from "../data/beninBanks";
import { queryMatches } from "../utils/search";
import { useI18n } from "../i18n/I18nContext";

const EMERALD = "#0B6E4F";

export function BanksScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const [query, setQuery] = useState("");

  // Built from its parts: `new Date("2026-08-28")` is parsed as UTC midnight
  // and formatted locally, which prints the day before west of Greenwich.
  const reviewed = (() => {
    const [year, month, day] = banksReviewedOn.split("-").map(Number);
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  })();

  // Matched on the trading name, the short one people actually say, and any
  // name the bank used to have — somebody holding a Diamond Bank passbook
  // does not know it was bought.
  const banks = beninBanks.filter((bank) =>
    queryMatches(query, ...bankSearchTerms(bank)),
  );

  // A search, not a pin, and now without a city either.
  //
  // The old list gave each bank one town and had no source for it. A bank has
  // branches in many, and naming one sends everybody else to the wrong place.
  // Searching the name alone lets the map answer with whichever branch is
  // nearest to the person holding the phone.
  const openInMaps = (bank) => {
    const search = encodeURIComponent(`${bank.name} Bénin`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${search}`);
  };

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </BackButton>
        <HeaderTitle>{t("menuBanksRow")}</HeaderTitle>
      </Header>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyContentStyle}
      >
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={t("banksSearchPlaceholder")}
        />

        <SectionTitle>{t("banksSectionTitle")}</SectionTitle>
        {banks.length === 0 ? (
          <EmptyText>{t("banksEmptyResults")}</EmptyText>
        ) : (
          banks.map((bank) => (
            <Row key={bank.key}>
              <IconWrap>
                <Ionicons name="business-outline" size={20} color={EMERALD} />
              </IconWrap>
              <RowBody>
                <RowName numberOfLines={2}>{bank.name}</RowName>
                {/* The old name, shown only where there is one. It is the
                    half a rename loses: a directory that knows only the new
                    name tells the customer their bank does not exist. */}
                {formerNames(bank.key).length ? (
                  <RowCity numberOfLines={1}>
                    {t("banksFormerly", {
                      name: formerNames(bank.key).join(", "),
                    })}
                  </RowCity>
                ) : null}
              </RowBody>
              <DirectionsButton onPress={() => openInMaps(bank)}>
                <RowDirectionsLabel>
                  {t("getDirectionsButton")}
                </RowDirectionsLabel>
              </DirectionsButton>
            </Row>
          ))
        )}
        {/* Where the list comes from and when it was read. A register is
            only as good as its date, and this one changes. */}
        <SourceNote>
          {t("banksSourceNote", { date: reviewed })}
        </SourceNote>
      </Body>
    </Container>
  );
}

const SourceNote = styled.Text`
  ${type.caption}
  margin-top: ${spacing.md}px;
  color: ${(props) => props.theme.textMuted};
`;

const bodyContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  padding: ${spacing.lg}px 0;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const IconWrap = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: rgba(11, 110, 79, 0.1);
  align-items: center;
  justify-content: center;
`;

const RowBody = styled.View`
  flex: 1;
  min-width: 0px;
`;

const RowName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const RowCity = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const DirectionsButton = styled(Pressable)`
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 8px;
`;

const RowDirectionsLabel = styled.Text`
  ${type.captionMedium}
  color: ${EMERALD};
`;
