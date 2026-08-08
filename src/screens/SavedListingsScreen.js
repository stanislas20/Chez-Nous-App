import { SafeAreaView } from 'react-native-safe-area-context';
import { FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { ListingCard } from '../components/ListingCard';
import { mockListings } from '../data/mockListings';
import { useApprovedListings } from '../hooks/useApprovedListings';
import { useFavorites } from '../hooks/useFavorites';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

const listContentStyle = { paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md };
const rowStyle = { justifyContent: 'space-between' };

export function SavedListingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const { favoriteIds } = useFavorites(user?.uid);
  const liveListings = useApprovedListings();
  const listings = liveListings ?? mockListings;
  const savedListings = listings.filter((listing) => favoriteIds.has(listing.id));

  if (!user) {
    return (
      <Container edges={['left', 'right', 'bottom']}>
        <EmptyState>
          <Ionicons name="heart-outline" size={40} color={colors.textMuted} />
          <EmptyTitle>{t('favoritesSignInTitle')}</EmptyTitle>
          <EmptySubtitle>{t('favoritesSignInMessage')}</EmptySubtitle>
        </EmptyState>
      </Container>
    );
  }

  if (savedListings.length === 0) {
    return (
      <Container edges={['left', 'right', 'bottom']}>
        <EmptyState>
          <Ionicons name="heart-outline" size={40} color={colors.textMuted} />
          <EmptyTitle>{t('savedEmptyTitle')}</EmptyTitle>
          <EmptySubtitle>{t('savedEmptySubtitle')}</EmptySubtitle>
        </EmptyState>
      </Container>
    );
  }

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <FlatList
        data={savedListings}
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

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${spacing.xl}px;
`;

const EmptyTitle = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.md}px;
  text-align: center;
`;

const EmptySubtitle = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.xs}px;
  text-align: center;
`;
