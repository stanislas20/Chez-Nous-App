import { useState } from 'react';
import { FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { ListingCard } from '../components/ListingCard';
import { mockListings } from '../data/mockListings';
import { cities } from '../data/cities';
import { useApprovedListings } from '../hooks/useApprovedListings';
import { useI18n } from '../i18n/I18nContext';

const chipRowContentStyle = { paddingHorizontal: spacing.md };
const listContentStyle = { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md };
const rowStyle = { justifyContent: 'space-between' };

export function LocalScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [selectedCity, setSelectedCity] = useState(null);

  const liveListings = useApprovedListings();
  // Pharmacie de Garde has its own dedicated category screen and shouldn't
  // be mixed into the general marketplace feed.
  const listings = (liveListings ?? mockListings).filter(
    (listing) => listing.categoryKey !== 'pharmacyOnDuty',
  );

  const filteredListings = selectedCity
    ? listings.filter((listing) => listing.city === selectedCity)
    : listings;

  return (
    <Container edges={['left', 'right']}>
      <Subtitle>{t('localSubtitle')}</Subtitle>

      <ChipRow
        horizontal
        showsHorizontalScrollIndicator={false}
        data={cities}
        keyExtractor={(city) => city}
        contentContainerStyle={chipRowContentStyle}
        renderItem={({ item: city }) => (
          <Chip
            selected={selectedCity === city}
            onPress={() => setSelectedCity(selectedCity === city ? null : city)}
          >
            <ChipLabel selected={selectedCity === city}>{city}</ChipLabel>
          </Chip>
        )}
      />

      <FlatList
        data={filteredListings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={rowStyle}
        contentContainerStyle={listContentStyle}
        renderItem={({ item }) => <ListingCard listing={item} />}
      />
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Subtitle = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.sm}px;
`;

const ChipRow = styled(FlatList)`
  flex-grow: 0;
  margin-top: ${spacing.sm}px;
`;

const Chip = styled(Pressable)`
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? props.theme.primary : props.theme.border)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.xs}px;
  margin-right: ${spacing.sm}px;
`;

const ChipLabel = styled.Text`
  ${(props) => (props.selected ? type.captionMedium : type.caption)}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;
