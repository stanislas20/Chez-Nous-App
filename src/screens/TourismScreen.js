import { useState } from 'react';
import { FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { SearchBar } from '../components/SearchBar';
import { mockAttractions, mockHotels } from '../data/mockAttractions';
import { queryMatches } from '../utils/search';
import { useI18n } from '../i18n/I18nContext';

const EMERALD = '#0B6E4F';
const GOLD = '#D9A441';
const hScrollContentStyle = { paddingRight: spacing.md, paddingVertical: spacing.md };

export function TourismScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const [query, setQuery] = useState('');

  const attractions = mockAttractions.filter((item) => {
    const name = language === 'en' ? item.nameEn : item.nameFr;
    return queryMatches(query, name, item.city);
  });
  const hotels = mockHotels.filter((hotel) => queryMatches(query, hotel.name, hotel.city));

  return (
    <Container edges={['top', 'left', 'right', 'bottom']}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </BackButton>
        <HeaderTitle>{t('menuTourismRow')}</HeaderTitle>
      </Header>

      <Body showsVerticalScrollIndicator={false} contentContainerStyle={bodyContentStyle}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={t('tourismSearchPlaceholder')} />

        <SectionTitle>{t('tourismAttractionsSectionTitle')}</SectionTitle>
        {attractions.length === 0 ? (
          <EmptyText>{t('tourismEmptyResults')}</EmptyText>
        ) : (
          attractions.map((item, index) => (
            <AttractionCard key={item.id}>
              <AttractionImg colors={[TAG_COLORS[index % TAG_COLORS.length], '#1d3a52']}>
                <AttractionTag numberOfLines={1}>{language === 'en' ? item.tagEn : item.tagFr}</AttractionTag>
              </AttractionImg>
              <AttractionBody>
                <AttractionName numberOfLines={1}>{language === 'en' ? item.nameEn : item.nameFr}</AttractionName>
                <AttractionCity>{item.city}</AttractionCity>
              </AttractionBody>
            </AttractionCard>
          ))
        )}

        <SectionTitle>{t('tourismHotelsSectionTitle')}</SectionTitle>
        {hotels.length === 0 ? (
          <EmptyText>{t('tourismEmptyResults')}</EmptyText>
        ) : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={hotels}
            keyExtractor={(item) => item.id}
            contentContainerStyle={hScrollContentStyle}
            renderItem={({ item }) => (
              <HotelCard>
                <HotelName numberOfLines={2}>{item.name}</HotelName>
                <HotelCity>{item.city}</HotelCity>
              </HotelCard>
            )}
          />
        )}
      </Body>
    </Container>
  );
}

const TAG_COLORS = [EMERALD, GOLD, '#C1512D', '#5a7fa6'];
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

const AttractionCard = styled.View`
  border-radius: ${radius.lg}px;
  overflow: hidden;
  background-color: ${(props) => props.theme.surface};
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const AttractionImg = styled(LinearGradient)`
  height: 100px;
  justify-content: flex-end;
  padding: ${spacing.sm}px;
`;

const AttractionTag = styled.Text`
  align-self: flex-start;
  ${type.caption}
  font-size: 9px;
  font-weight: 700;
  color: #ffffff;
  background-color: rgba(0, 0, 0, 0.4);
  padding: 3px 8px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const AttractionBody = styled.View`
  padding: 10px 12px 12px;
`;

const AttractionName = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
  margin-bottom: 3px;
`;

const AttractionCity = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const HotelCard = styled.View`
  flex-shrink: 0;
  width: 160px;
  padding: 14px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  margin-right: ${spacing.sm}px;
  ${shadow.card}
`;

const HotelName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12.5px;
  color: ${(props) => props.theme.text};
  line-height: 16px;
  margin-bottom: 6px;
`;

const HotelCity = styled.Text`
  ${type.caption}
  font-size: 11px;
  color: ${(props) => props.theme.textMuted};
`;
