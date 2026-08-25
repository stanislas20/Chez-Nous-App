import { useState } from "react";
import { Linking, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { SearchBar } from "../components/SearchBar";
import { mockBanks } from "../data/mockBanks";
import { queryMatches } from "../utils/search";
import { useI18n } from "../i18n/I18nContext";

const EMERALD = "#0B6E4F";

export function BanksScreen({ navigation }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const banks = mockBanks.filter((bank) =>
    queryMatches(query, bank.name, bank.city),
  );

  // No verified street address/coordinates for these branches, so this
  // opens a Maps *search* for the name + city rather than pretending to
  // have a precise pinned location to route to.
  const openInMaps = (bank) => {
    const query = encodeURIComponent(`${bank.name} ${bank.city} Bénin`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
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
            <Row key={bank.id}>
              <IconWrap>
                <Ionicons name="business-outline" size={20} color={EMERALD} />
              </IconWrap>
              <RowBody>
                <RowName numberOfLines={1}>{bank.name}</RowName>
                <RowCity numberOfLines={1}>{bank.city}</RowCity>
              </RowBody>
              <DirectionsButton onPress={() => openInMaps(bank)}>
                <RowDirectionsLabel>
                  {t("getDirectionsButton")}
                </RowDirectionsLabel>
              </DirectionsButton>
            </Row>
          ))
        )}
      </Body>
    </Container>
  );
}

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
