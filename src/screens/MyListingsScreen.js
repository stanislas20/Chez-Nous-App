import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useMyListings } from '../hooks/useMyListings';
import { firestore, storage } from '../config/firebase';
import { getDutyLabel } from '../utils/pharmacyDuty';

const priceFormatter = new Intl.NumberFormat('fr-FR');
const listContentStyle = { padding: spacing.md };

function getSaleStatuses(colors) {
  return [
    { key: 'available', icon: 'pricetag-outline', tint: colors.primaryLight, iconColor: colors.primary },
    { key: 'pending', icon: 'time-outline', tint: colors.accentLight, iconColor: colors.accentDark },
    { key: 'negotiating', icon: 'chatbubbles-outline', tint: 'rgba(91, 192, 235, 0.18)', iconColor: colors.skyBlue },
    { key: 'sold', icon: 'checkmark-done-outline', tint: colors.errorLight, iconColor: colors.error },
  ];
}
const saleStatusLabelKeys = {
  available: 'saleStatusAvailable',
  pending: 'saleStatusPending',
  negotiating: 'saleStatusNegotiating',
  sold: 'saleStatusSold',
};

export function MyListingsScreen() {
  const { colors } = useTheme();
  const saleStatuses = getSaleStatuses(colors);
  const { language, t } = useI18n();
  const { user } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const listings = useMyListings(user?.uid);
  const [menuItem, setMenuItem] = useState(null);
  const [statusMenuItem, setStatusMenuItem] = useState(null);

  const closeMenu = () => setMenuItem(null);
  const closeStatusMenu = () => setStatusMenuItem(null);
  const menuTitle = menuItem ? (language === 'en' ? menuItem.titleEn : menuItem.titleFr) : '';
  const statusMenuTitle = statusMenuItem
    ? language === 'en'
      ? statusMenuItem.titleEn
      : statusMenuItem.titleFr
    : '';

  const handleShare = async (item, title) => {
    try {
      await Share.share({
        message: t('shareListingMessage', {
          title,
          price: `${priceFormatter.format(item.price)} FCFA`,
        }),
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleDelete = async (item) => {
    try {
      const paths = [item.mediaPath, ...(item.media ?? []).map((m) => m.mediaPath)].filter(Boolean);
      await Promise.all(
        [...new Set(paths)].map((path) => deleteObject(ref(storage, path)).catch(() => {})),
      );
      await deleteDoc(doc(firestore, 'listings', item.id));
    } catch {
      Alert.alert(t('myListingsTitle'), t('errorDeleteFailed'));
    }
  };

  const handleSetSaleStatus = async (item, saleStatus) => {
    closeStatusMenu();
    try {
      await updateDoc(doc(firestore, 'listings', item.id), {
        saleStatus,
        soldAt: saleStatus === 'sold' ? serverTimestamp() : null,
      });
    } catch {
      Alert.alert(t('myListingsTitle'), t('errorSaleStatusFailed'));
    }
  };

  const confirmDelete = (item) => {
    Alert.alert(t('deleteListingConfirmTitle'), t('deleteListingConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteButton'), style: 'destructive', onPress: () => handleDelete(item) },
    ]);
  };

  return (
    <Container edges={['left', 'right', 'bottom']}>
      <FlatList
        data={listings ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          listings !== null ? <EmptyMessage>{t('myListingsEmptyMessage')}</EmptyMessage> : null
        }
        ListHeaderComponent={
          listings?.length ? <HintText>{t('myListingsLongPressHint')}</HintText> : null
        }
        renderItem={({ item }) => {
          const title = language === 'en' ? item.titleEn : item.titleFr;
          const coverUri = item.mediaUrl ?? item.image;
          const isApproved = item.status === 'approved';
          const isPharmacy = item.categoryKey === 'pharmacyOnDuty';
          const dutyLabel = isPharmacy ? getDutyLabel(item, language, t).text || item.phone : '';

          return (
            <Row
              onPress={() =>
                navigation.navigate('ProductDetail', { listing: { ...item, createdAt: null } })
              }
              onLongPress={() => setMenuItem(item)}
            >
              <Thumbnail source={{ uri: coverUri }} resizeMode="cover" />
              <RowBody>
                <RowTitle numberOfLines={1}>{title}</RowTitle>
                <RowPrice>
                  {isPharmacy ? dutyLabel : `${priceFormatter.format(item.price)} FCFA`}
                </RowPrice>
                <PillRow>
                  <StatusPill approved={isApproved}>
                    <StatusPillLabel approved={isApproved}>
                      {isApproved ? t('listingStatusApproved') : t('listingStatusPending')}
                    </StatusPillLabel>
                  </StatusPill>
                  {!isPharmacy && item.saleStatus && item.saleStatus !== 'available' ? (
                    <SaleStatusPill saleStatus={item.saleStatus}>
                      <SaleStatusPillLabel saleStatus={item.saleStatus}>
                        {t(saleStatusLabelKeys[item.saleStatus])}
                      </SaleStatusPillLabel>
                    </SaleStatusPill>
                  ) : null}
                </PillRow>
              </RowBody>
            </Row>
          );
        }}
      />

      <Modal visible={!!menuItem} transparent animationType="fade" onRequestClose={closeMenu}>
        <Backdrop onPress={closeMenu}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle numberOfLines={1}>{menuTitle}</SheetTitle>

              <SheetRow
                onPress={() => {
                  closeMenu();
                  navigation.navigate('EditListing', { listing: menuItem });
                }}
              >
                <SheetIconCircle tint={colors.primaryLight}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </SheetIconCircle>
                <SheetRowLabel>{t('editButton')}</SheetRowLabel>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SheetRow>

              {menuItem?.categoryKey === 'pharmacyOnDuty' ? null : (
                <SheetRow
                  onPress={() => {
                    const item = menuItem;
                    setStatusMenuItem(item);
                    closeMenu();
                  }}
                >
                  <SheetIconCircle tint="rgba(91, 192, 235, 0.18)">
                    <Ionicons name="flag-outline" size={20} color={colors.skyBlue} />
                  </SheetIconCircle>
                  <SheetRowLabel>{t('saleStatusButton')}</SheetRowLabel>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </SheetRow>
              )}

              <SheetRow
                onPress={() => {
                  const item = menuItem;
                  const title = menuTitle;
                  closeMenu();
                  handleShare(item, title);
                }}
              >
                <SheetIconCircle tint={colors.accentLight}>
                  <Ionicons name="share-social-outline" size={20} color={colors.accentDark} />
                </SheetIconCircle>
                <SheetRowLabel>{t('shareButton')}</SheetRowLabel>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SheetRow>

              <SheetRow
                last
                onPress={() => {
                  const item = menuItem;
                  closeMenu();
                  confirmDelete(item);
                }}
              >
                <SheetIconCircle tint={colors.errorLight}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </SheetIconCircle>
                <SheetRowLabel destructive>{t('deleteButton')}</SheetRowLabel>
              </SheetRow>

              <CancelButton onPress={closeMenu}>
                <CancelLabel>{t('cancel')}</CancelLabel>
              </CancelButton>
            </Sheet>
          </Pressable>
        </Backdrop>
      </Modal>

      <Modal
        visible={!!statusMenuItem}
        transparent
        animationType="fade"
        onRequestClose={closeStatusMenu}
      >
        <Backdrop onPress={closeStatusMenu}>
          <Pressable onPress={() => {}}>
            <Sheet style={{ paddingBottom: spacing.md + insets.bottom }}>
              <SheetHandle />
              <SheetTitle numberOfLines={1}>
                {t('saleStatusPickerTitle')} — {statusMenuTitle}
              </SheetTitle>

              {saleStatuses.map((option, index) => (
                <SheetRow
                  key={option.key}
                  last={index === saleStatuses.length - 1}
                  onPress={() => handleSetSaleStatus(statusMenuItem, option.key)}
                >
                  <SheetIconCircle tint={option.tint}>
                    <Ionicons name={option.icon} size={20} color={option.iconColor} />
                  </SheetIconCircle>
                  <SheetRowLabel>{t(saleStatusLabelKeys[option.key])}</SheetRowLabel>
                  {(statusMenuItem?.saleStatus ?? 'available') === option.key ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </SheetRow>
              ))}

              <CancelButton onPress={closeStatusMenu}>
                <CancelLabel>{t('cancel')}</CancelLabel>
              </CancelButton>
            </Sheet>
          </Pressable>
        </Backdrop>
      </Modal>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Row = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const Thumbnail = styled.Image`
  width: 64px;
  height: 64px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const RowBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const RowTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const RowPrice = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.primaryDark};
`;

const PillRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.xs}px;
  margin-top: 2px;
`;

const StatusPill = styled.View`
  align-self: flex-start;
  background-color: ${(props) => (props.approved ? props.theme.primaryLight : props.theme.accentLight)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 2px;
`;

const StatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => (props.approved ? props.theme.primaryDark : props.theme.accentDark)};
  font-size: 11px;
`;

const saleStatusTint = (theme) => ({
  pending: theme.accentLight,
  negotiating: 'rgba(91, 192, 235, 0.18)',
  sold: theme.errorLight,
});

const saleStatusTextColor = (theme) => ({
  pending: theme.accentDark,
  negotiating: theme.skyBlue,
  sold: theme.error,
});

const SaleStatusPill = styled.View`
  align-self: flex-start;
  background-color: ${(props) => saleStatusTint(props.theme)[props.saleStatus]};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 2px;
`;

const SaleStatusPillLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => saleStatusTextColor(props.theme)[props.saleStatus]};
  font-size: 11px;
`;

const EmptyMessage = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-top: ${spacing.xl}px;
`;

const HintText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-bottom: ${spacing.md}px;
`;

const Backdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: ${(props) => props.theme.scrim};
`;

const Sheet = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-top-left-radius: ${radius.xl}px;
  border-top-right-radius: ${radius.xl}px;
  padding: ${spacing.md}px;
  shadow-color: #0b1f16;
  shadow-offset: 0px -4px;
  shadow-opacity: 0.12;
  shadow-radius: 16px;
  elevation: 8;
`;

const SheetHandle = styled.View`
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background-color: ${(props) => props.theme.border};
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  margin-bottom: ${spacing.sm}px;
`;

const SheetRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  border-bottom-width: ${(props) => (props.last ? '0px' : '1px')};
  border-bottom-color: ${(props) => props.theme.border};
`;

const SheetIconCircle = styled.View`
  width: 38px;
  height: 38px;
  border-radius: 19px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.tint};
`;

const SheetRowLabel = styled.Text`
  ${type.bodyMedium}
  flex: 1;
  color: ${(props) => (props.destructive ? props.theme.error : props.theme.text)};
`;

const CancelButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  margin-top: ${spacing.md}px;
`;

const CancelLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.text};
`;
