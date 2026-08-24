import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useCountries } from "../hooks/useCountries";
import { queryMatches } from "../utils/search";

// One country picker for sign-up, login and password recovery.
//
// It was three copies of a five-row list. At five rows that was merely
// repetitive; at 245 it would have been three chances to get the same two
// things wrong:
//
//   * Selection by list index. Add a search box and the index means a
//     position in the filtered list, so typing "fra" and tapping France
//     selected whatever now sat at that offset. The chosen country travels
//     as its ISO code here, which nothing can reorder.
//   * `key={item.dial}`. Dial codes are not unique — twenty-five countries
//     share +1 — so React saw one row where there were twenty-five, and
//     tapping any of them selected the same one.
//
// Search covers the name and the dial code, because people look for their
// country both ways: "Nigeria" and "+234" should both find it.
export function CountryPickerSheet({
  visible,
  selectedCode,
  onSelect,
  onClose,
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const countries = useCountries();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim();
    if (!term) return countries;
    return countries.filter(
      (item) =>
        queryMatches(term, item.name) ||
        item.dial.replace("+", "").startsWith(term.replace("+", "")),
    );
  }, [countries, query]);

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <SheetBackdrop onPress={close}>
        {/* A Modal opens its own view hierarchy, outside whatever keyboard
            handling the screen behind it set up — so this sheet needs its
            own. Without it the keyboard rose over a bottom-anchored sheet
            and covered the entire list: you could type a country name and
            never see the result. */}
        <Avoider
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
        >
          <Sheet onStartShouldSetResponder={() => true}>
            <SheetHandle />
            <SheetTitle>{t("countryPickerTitle")}</SheetTitle>

            <SearchRow>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <SearchInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("countryPickerSearch")}
                placeholderTextColor={colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={10}>
                  <Ionicons
                    name="close-circle"
                    size={17}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </SearchRow>

            <RowScroll
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filtered.map((item) => (
                <CountryRow
                  key={item.code}
                  selected={item.code === selectedCode}
                  onPress={() => {
                    onSelect(item.code);
                    close();
                  }}
                >
                  <FlagEmoji>{item.flag}</FlagEmoji>
                  <CountryName numberOfLines={1}>{item.name}</CountryName>
                  <CountryDial>{item.dial}</CountryDial>
                </CountryRow>
              ))}
              {filtered.length === 0 ? (
                <EmptyText>{t("countryPickerEmpty")}</EmptyText>
              ) : null}
            </RowScroll>
          </Sheet>
        </Avoider>
      </SheetBackdrop>
    </Modal>
  );
}

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.45);
`;

// flex:1 rather than sizing to the sheet, so the sheet's percentage height
// resolves against the space actually left once the keyboard has taken its
// share.
const Avoider = styled(KeyboardAvoidingView)`
  flex: 1;
  justify-content: flex-end;
`;

const Sheet = styled.View`
  max-height: 82%;
  padding: ${spacing.sm}px ${spacing.md}px ${spacing.lg}px;
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  background-color: ${(props) => props.theme.surface};
`;

const SheetHandle = styled.View`
  width: 44px;
  height: 4px;
  border-radius: 2px;
  align-self: center;
  margin-bottom: ${spacing.sm}px;
  background-color: ${(props) => props.theme.border};
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const SearchRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 0px 13px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  margin-bottom: ${spacing.sm}px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  font-family: ${fontFamily.regular};
  font-size: 14px;
  color: ${(props) => props.theme.text};
  padding: 0px;
`;

const RowScroll = styled.ScrollView`
  flex-grow: 0;
  flex-shrink: 1;
`;

const CountryRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  min-height: 52px;
  padding: 0px 12px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) =>
    props.selected ? props.theme.primaryLight : "transparent"};
`;

const FlagEmoji = styled.Text`
  font-size: 20px;
`;

const CountryName = styled.Text`
  flex: 1;
  font-family: ${fontFamily.medium};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const CountryDial = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${(props) => props.theme.textMuted};
`;

const EmptyText = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 13px;
  text-align: center;
  padding: ${spacing.lg}px 0px;
  color: ${(props) => props.theme.textMuted};
`;
