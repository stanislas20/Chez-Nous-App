import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { CategoryTile } from '../components/CategoryTile';
import { categories } from '../data/categories';
import { useI18n } from '../i18n/I18nContext';

const listContentStyle = { padding: spacing.md, paddingBottom: spacing.xl };
const rowStyle = { justifyContent: 'center', gap: spacing.sm };

const THEME_OPTIONS = [
  { key: 'system', icon: 'phone-portrait-outline', labelKey: 'themeSystem' },
  { key: 'light', icon: 'sunny-outline', labelKey: 'themeLight' },
  { key: 'dark', icon: 'moon-outline', labelKey: 'themeDark' },
];

export function MoreScreen({ navigation }) {
  const { colors, preference, setPreference } = useTheme();
  const { language, t } = useI18n();

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <FlatList
        data={categories}
        keyExtractor={(item) => item.key}
        numColumns={3}
        columnWrapperStyle={rowStyle}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={
          <>
            <AdvertiseTile onPress={() => navigation.navigate('Advertise')}>
              <AdvertiseIconWrap>
                <Ionicons name="megaphone-outline" size={22} color={colors.primary} />
              </AdvertiseIconWrap>
              <AdvertiseLabel>{t('moreAdvertiseTileLabel')}</AdvertiseLabel>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AdvertiseTile>

            <ThemeSection>
              <ThemeSectionTitle>{t('themeSectionTitle')}</ThemeSectionTitle>
              <ThemeOptionsRow>
                {THEME_OPTIONS.map((option) => {
                  const selected = preference === option.key;
                  return (
                    <ThemeOption
                      key={option.key}
                      selected={selected}
                      onPress={() => setPreference(option.key)}
                    >
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={selected ? colors.textInverse : colors.text}
                      />
                      <ThemeOptionLabel selected={selected}>{t(option.labelKey)}</ThemeOptionLabel>
                    </ThemeOption>
                  );
                })}
              </ThemeOptionsRow>
            </ThemeSection>
          </>
        }
        renderItem={({ item, index }) => (
          <CategoryTile
            icon={item.icon}
            label={language === 'en' ? item.labelEn : item.labelFr}
            large={index === categories.length - 1 && categories.length % 3 === 1}
            onPress={() =>
              navigation.navigate('CategoryListings', {
                categoryKey: item.key,
                labelEn: item.labelEn,
                labelFr: item.labelFr,
              })
            }
          />
        )}
      />
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const AdvertiseTile = styled.Pressable`
  flex-direction: row;
  align-items: center;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  gap: ${spacing.sm}px;
`;

const AdvertiseIconWrap = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: ${(props) => props.theme.primaryLight};
  align-items: center;
  justify-content: center;
`;

const AdvertiseLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

const ThemeSection = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  gap: ${spacing.sm}px;
`;

const ThemeSectionTitle = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  text-transform: uppercase;
`;

const ThemeOptionsRow = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
`;

const ThemeOption = styled.Pressable`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surfaceAlt)};
`;

const ThemeOptionLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;
