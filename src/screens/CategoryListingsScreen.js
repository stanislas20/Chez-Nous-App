import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { ListingCard } from '../components/ListingCard';
import { CategoryPlaceholder } from '../components/CategoryPlaceholder';
import { PhoneCallButtons } from '../components/PhoneCallButtons';
import { SearchBar } from '../components/SearchBar';
import { mockListings } from '../data/mockListings';
import { useApprovedListings } from '../hooks/useApprovedListings';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useNearbyPharmacies } from '../hooks/useNearbyPharmacies';
import { useI18n } from '../i18n/I18nContext';
import { categories } from '../data/categories';
import { cityCoordinates } from '../data/cityCoordinates';
import { distanceInKm } from '../utils/geo';
import { getDutyLabel } from '../utils/pharmacyDuty';

const listContentStyle = { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md };
const rowStyle = { justifyContent: 'space-between' };
const categoryIconByKey = categories.reduce((map, category) => {
  map[category.key] = category.icon;
  return map;
}, {});

// Groups listings by city (alphabetically) into a flat list of header/item
// entries for a single-column directory-style list.
function groupByCity(listings) {
  const byCity = new Map();
  for (const listing of listings) {
    const city = listing.city || '—';
    if (!byCity.has(city)) byCity.set(city, []);
    byCity.get(city).push(listing);
  }
  const cities = [...byCity.keys()].sort((a, b) => a.localeCompare(b));

  const rows = [];
  for (const city of cities) {
    const items = byCity.get(city);
    rows.push({ type: 'header', key: `header-${city}`, city, count: items.length });
    for (const listing of items) {
      rows.push({ type: 'item', key: listing.id, listing });
    }
  }
  return rows;
}

function PharmacyRow({ listing }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { language, t } = useI18n();
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const duty = getDutyLabel(listing, language, t);
  const categoryIcon = categoryIconByKey[listing.categoryKey] ?? 'medkit-outline';

  return (
    <PharmacyRowContainer
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
    >
      <PharmacyThumb>
        <CategoryPlaceholder icon={categoryIcon} size="card" />
      </PharmacyThumb>
      <PharmacyRowBody>
        <PharmacyRowTitle numberOfLines={1}>{title}</PharmacyRowTitle>
        {duty.text ? (
          <PharmacyRowDuty>
            <Ionicons name="time-outline" size={13} color={duty.isStale ? colors.accentDark : colors.error} />
            <PharmacyRowDutyText stale={duty.isStale} numberOfLines={1}>
              {duty.text}
            </PharmacyRowDutyText>
          </PharmacyRowDuty>
        ) : null}
        {listing.phone ? (
          <PhoneCallButtons phone={listing.phone} size="sm" style={{ marginTop: 4 }} />
        ) : null}
      </PharmacyRowBody>
    </PharmacyRowContainer>
  );
}

// A real, live pharmacy from Google Places — not part of the ONPB on-duty
// roster, just an ordinary nearby pharmacy the user might be searching for.
function NearbyPharmacyRow({ place }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const handleDirections = () => {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`,
    );
  };

  return (
    <PharmacyRowContainer onPress={handleDirections}>
      <PharmacyThumb>
        <CategoryPlaceholder icon="storefront-outline" size="card" />
      </PharmacyThumb>
      <PharmacyRowBody>
        <PharmacyRowTitle numberOfLines={1}>{place.name}</PharmacyRowTitle>
        {place.address ? <PharmacyRowPhone numberOfLines={1}>{place.address}</PharmacyRowPhone> : null}
        <NearestDistanceText>
          {t('nearestPharmacyDistance', { distance: place.distance.toFixed(1) })}
        </NearestDistanceText>
      </PharmacyRowBody>
      <NearbyDirectionsButton onPress={handleDirections} hitSlop={8}>
        <Ionicons name="navigate" size={17} color={colors.textInverse} />
      </NearbyDirectionsButton>
    </PharmacyRowContainer>
  );
}

function NearestPharmacyCard({ status, nearest, onRequestLocation }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { language, t } = useI18n();

  if (status === 'idle' || status === 'locating') {
    return (
      <NearestCard>
        <ActivityIndicator color={colors.primary} />
        <NearestLocatingText>{t('nearestPharmacyLocating')}</NearestLocatingText>
      </NearestCard>
    );
  }

  if (status === 'denied' || status === 'error') {
    return (
      <NearestCard>
        <NearestLocatingText>
          {status === 'denied' ? t('nearestPharmacyPermissionDenied') : t('nearestPharmacyUnavailable')}
        </NearestLocatingText>
        <EnableLocationButton onPress={onRequestLocation}>
          <Ionicons name="locate-outline" size={15} color={colors.textInverse} />
          <EnableLocationButtonLabel>{t('nearestPharmacyEnableLocation')}</EnableLocationButtonLabel>
        </EnableLocationButton>
      </NearestCard>
    );
  }

  if (!nearest) return null;

  const { listing, distance } = nearest;
  const title = language === 'en' ? listing.titleEn : listing.titleFr;
  const duty = getDutyLabel(listing, language, t);
  const categoryIcon = categoryIconByKey[listing.categoryKey] ?? 'medkit-outline';
  const cityCoord = cityCoordinates[listing.city];

  const handleDirections = () => {
    if (!cityCoord) return;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${cityCoord.latitude},${cityCoord.longitude}`,
    );
  };

  return (
    <NearestCard
      highlighted
      onPress={() => navigation.navigate('ProductDetail', { listing: { ...listing, createdAt: null } })}
    >
      <NearestHeaderRow>
        <Ionicons name="navigate-circle" size={18} color={colors.primary} />
        <NearestHeaderText>{t('nearestPharmacyTitle')}</NearestHeaderText>
      </NearestHeaderRow>
      <NearestBodyRow>
        <PharmacyThumb>
          <CategoryPlaceholder icon={categoryIcon} size="card" />
        </PharmacyThumb>
        <PharmacyRowBody>
          <PharmacyRowTitle numberOfLines={1}>{title}</PharmacyRowTitle>
          <NearestDistanceText>
            {t('nearestPharmacyDistance', { distance: distance.toFixed(1) })}
          </NearestDistanceText>
          {duty.text ? (
            <PharmacyRowDuty>
              <Ionicons name="time-outline" size={13} color={duty.isStale ? colors.accentDark : colors.error} />
              <PharmacyRowDutyText stale={duty.isStale} numberOfLines={1}>
                {duty.text}
              </PharmacyRowDutyText>
            </PharmacyRowDuty>
          ) : null}
        </PharmacyRowBody>
      </NearestBodyRow>
      <NearestActionsRow>
        {listing.phone ? <PhoneCallButtons phone={listing.phone} size="md" /> : null}
        {cityCoord ? (
          <NearestActionButton secondary onPress={handleDirections}>
            <Ionicons name="navigate-outline" size={15} color={colors.primary} />
            <NearestActionButtonLabel secondary>{t('getDirectionsButton')}</NearestActionButtonLabel>
          </NearestActionButton>
        ) : null}
      </NearestActionsRow>
      <NearestBrowseAllText>{t('nearestPharmacyBrowseAll')}</NearestBrowseAllText>
    </NearestCard>
  );
}

export function CategoryListingsScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { categoryKey, labelEn, labelFr } = route.params;
  const { language, t } = useI18n();
  const categoryLabel = language === 'en' ? labelEn : labelFr;
  const [query, setQuery] = useState('');
  const groupByLocation = categoryKey === 'pharmacyOnDuty';

  useLayoutEffect(() => {
    navigation.setOptions({ title: categoryLabel });
  }, [navigation, categoryLabel]);

  const liveListings = useApprovedListings();
  const allListings = liveListings ?? mockListings;
  const categoryListings = allListings.filter(
    (listing) =>
      listing.categoryKey === categoryKey &&
      // "Pharmacie de garde" is the rotating on-duty roster — pharmacies
      // permanently mandated to stay open every day belong to a separate
      // ONPB designation and shouldn't crowd out the current rotation.
      !(categoryKey === 'pharmacyOnDuty' && listing.isPermanentDuty),
  );

  const normalizedQuery = query.trim().toLowerCase();
  const listings = normalizedQuery
    ? categoryListings.filter((listing) => {
        const title = (language === 'en' ? listing.titleEn : listing.titleFr) ?? '';
        return (
          title.toLowerCase().includes(normalizedQuery) ||
          (listing.city ?? '').toLowerCase().includes(normalizedQuery)
        );
      })
    : categoryListings;

  const { status: locationStatus, coords, requestLocation } = useCurrentLocation({
    enabled: groupByLocation,
  });

  const nearestPharmacy = useMemo(() => {
    if (!coords || categoryListings.length === 0) return null;
    let closestListing = null;
    let closestDistance = Infinity;
    for (const listing of categoryListings) {
      const cityCoord = cityCoordinates[listing.city];
      if (!cityCoord) continue;
      const distance = distanceInKm(coords, cityCoord);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestListing = listing;
      }
    }
    return closestListing ? { listing: closestListing, distance: closestDistance } : null;
  }, [coords, categoryListings]);

  const { status: nearbyStatus, pharmacies: nearbyPharmacies } = useNearbyPharmacies(
    groupByLocation ? coords : null,
  );
  const filteredNearbyPharmacies = normalizedQuery
    ? nearbyPharmacies.filter((place) => place.name.toLowerCase().includes(normalizedQuery))
    : nearbyPharmacies;

  const pharmacyRows = useMemo(() => {
    if (!groupByLocation) return null;
    const rows = [];
    if (listings.length > 0) {
      rows.push({ type: 'section', key: 'section-garde', title: t('onDutySectionTitle') });
      rows.push(...groupByCity(listings));
    }
    if (locationStatus === 'granted') {
      rows.push({ type: 'section', key: 'section-nearby', title: t('nearbyPharmaciesSectionTitle') });
      if (nearbyStatus === 'loading') {
        rows.push({ type: 'nearby-status', key: 'nearby-status', status: 'loading' });
      } else if (nearbyStatus === 'error') {
        rows.push({ type: 'nearby-status', key: 'nearby-status', status: 'error' });
      } else if (filteredNearbyPharmacies.length === 0) {
        rows.push({ type: 'nearby-status', key: 'nearby-status', status: 'empty' });
      } else {
        for (const place of filteredNearbyPharmacies) {
          rows.push({ type: 'nearby', key: `nearby-${place.id}`, place });
        }
      }
    }
    return rows;
  }, [groupByLocation, listings, locationStatus, nearbyStatus, filteredNearbyPharmacies, t]);

  return (
    <Container edges={['left', 'right']}>
      {groupByLocation ? (
        <NearestPharmacyCard
          status={locationStatus}
          nearest={nearestPharmacy}
          onRequestLocation={requestLocation}
        />
      ) : null}
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={groupByLocation ? t('pharmacySearchPlaceholder') : undefined}
      />
      {groupByLocation ? (
        <FlatList
          key="grouped"
          data={pharmacyRows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={listContentStyle}
          ListEmptyComponent={
            <EmptyState>
              <EmptyText>
                {categoryListings.length === 0 ? t('categoryListingsComingSoon') : t('categoryListingsNoResults')}
              </EmptyText>
            </EmptyState>
          }
          renderItem={({ item: row }) => {
            if (row.type === 'section') {
              return (
                <SectionTitle>{row.title}</SectionTitle>
              );
            }
            if (row.type === 'header') {
              return (
                <CityHeader>
                  <CityHeaderText>{row.city}</CityHeaderText>
                  <CityHeaderCount>{row.count}</CityHeaderCount>
                </CityHeader>
              );
            }
            if (row.type === 'nearby') {
              return <NearbyPharmacyRow place={row.place} />;
            }
            if (row.type === 'nearby-status') {
              return (
                <NearbyStatusRow>
                  {row.status === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
                  <NearbyStatusText>
                    {row.status === 'loading'
                      ? t('nearbyPharmaciesLoading')
                      : row.status === 'error'
                        ? t('nearbyPharmaciesUnavailable')
                        : t('nearbyPharmaciesEmpty')}
                  </NearbyStatusText>
                </NearbyStatusRow>
              );
            }
            return <PharmacyRow listing={row.listing} />;
          }}
        />
      ) : listings.length === 0 ? (
        <EmptyState>
          <EmptyText>
            {categoryListings.length === 0 ? t('categoryListingsComingSoon') : t('categoryListingsNoResults')}
          </EmptyText>
        </EmptyState>
      ) : (
        <FlatList
          key="grid"
          data={listings}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={rowStyle}
          contentContainerStyle={listContentStyle}
          renderItem={({ item }) => <ListingCard listing={item} />}
        />
      )}
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const NearestCard = styled(Pressable)`
  background-color: ${(props) => (props.highlighted ? props.theme.primaryLight : props.theme.surface)};
  border-radius: ${radius.md}px;
  padding: ${spacing.md}px;
  margin-horizontal: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
  gap: ${spacing.xs}px;
  ${shadow.card}
`;

const NearestHeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
`;

const NearestHeaderText = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primary};
  text-transform: uppercase;
`;

const NearestBodyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
`;

const NearestDistanceText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const NearestLocatingText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  flex: 1;
`;

const NearestActionsRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
  margin-top: ${spacing.xs}px;
`;

const NearestActionButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding-horizontal: ${spacing.md}px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => (props.secondary ? 'transparent' : props.theme.primary)};
  border-width: ${(props) => (props.secondary ? '1px' : '0px')};
  border-color: ${(props) => props.theme.primary};
`;

const NearestActionButtonLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.secondary ? props.theme.primary : props.theme.textInverse)};
`;

const EnableLocationButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding-horizontal: ${spacing.md}px;
  height: 34px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primary};
`;

const EnableLocationButtonLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textInverse};
`;

const NearestBrowseAllText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: 2px;
`;

const SectionTitle = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.lg}px;
  margin-bottom: ${spacing.sm}px;
  padding-bottom: ${spacing.sm}px;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const NearbyStatusRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
`;

const NearbyStatusText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  flex: 1;
`;

const CityHeader = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: ${spacing.xs}px;
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
`;

const CityHeaderText = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const CityHeaderCount = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const PharmacyRowContainer = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const PharmacyThumb = styled.View`
  width: 56px;
  height: 56px;
  border-radius: ${radius.sm}px;
  overflow: hidden;
`;

const PharmacyRowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const PharmacyRowTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const PharmacyRowDuty = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
`;

const PharmacyRowDutyText = styled.Text`
  ${type.caption}
  color: ${(props) => (props.stale ? props.theme.accentDark : props.theme.error)};
  flex-shrink: 1;
`;

const PharmacyRowPhone = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const NearbyDirectionsButton = styled(Pressable)`
  width: 38px;
  height: 38px;
  border-radius: 19px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
`;

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.lg}px;
`;

const EmptyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;
