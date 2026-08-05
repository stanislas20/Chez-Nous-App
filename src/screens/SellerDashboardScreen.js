import { useState } from 'react';
import { Alert, FlatList, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { storage, firestore } from '../config/firebase';
import { CategoryTile } from '../components/CategoryTile';
import { categories } from '../data/categories';

const listContentStyle = { padding: spacing.md };
const rowStyle = { justifyContent: 'center', gap: spacing.sm };

export function SellerDashboardScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user, sellerProfile, refreshSellerProfile } = useAuth();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('sellerDashboardTitle'), t('errorGeneric'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setIsUploadingAvatar(true);
    try {
      const extension = asset.uri.split('.').pop().split('?')[0];
      const fileName = `${Date.now()}.${extension}`;
      const avatarPath = `sellers/${user.uid}/${fileName}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, avatarPath);
      const uploadTask = uploadBytesResumable(storageRef, blob);
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, resolve);
      });
      const photoUrl = await getDownloadURL(storageRef);

      await setDoc(doc(firestore, 'sellers', user.uid), { photoUrl }, { merge: true });
      await refreshSellerProfile();
    } catch (error) {
      Alert.alert(t('sellerDashboardTitle'), t('errorUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const gridData = [...categories, { key: '__promote__', isPromoteTile: true }];

  return (
    <Container edges={['left', 'right']}>
      <FlatList
        data={gridData}
        keyExtractor={(item) => item.key}
        numColumns={3}
        columnWrapperStyle={rowStyle}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={
          <>
            <ProfileRow>
              <AvatarButton onPress={pickAvatar} disabled={isUploadingAvatar}>
                {sellerProfile?.photoUrl ? (
                  <Avatar source={{ uri: sellerProfile.photoUrl }} resizeMode="cover" />
                ) : (
                  <AvatarPlaceholder>
                    <Ionicons name="person-outline" size={28} color={colors.primary} />
                  </AvatarPlaceholder>
                )}
                <AvatarEditBadge>
                  <Ionicons name="camera-outline" size={12} color={colors.textInverse} />
                </AvatarEditBadge>
              </AvatarButton>
              <SellerName numberOfLines={1}>{sellerProfile?.fullName}</SellerName>
            </ProfileRow>

            <MyListingsLink onPress={() => navigation.navigate('MyListings')}>
              <Ionicons name="list-outline" size={18} color={colors.primary} />
              <MyListingsLinkLabel>{t('myListingsLink')}</MyListingsLinkLabel>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </MyListingsLink>

            <MyListingsLink onPress={() => navigation.navigate('SellerInsights')}>
              <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
              <MyListingsLinkLabel>{t('sellerInsightsLink')}</MyListingsLinkLabel>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </MyListingsLink>
          </>
        }
        renderItem={({ item, index }) => {
          const remainder = gridData.length % 3;
          const large = index === gridData.length - 1 && remainder === 1;
          const wide = remainder === 2 && index >= gridData.length - 2;
          return item.isPromoteTile ? (
            <PromoteTile
              large={large}
              wide={wide}
              onPress={() => navigation.navigate('CreateListing', { categoryKey: null, isPromoted: true })}
            >
              <Ionicons name="megaphone-outline" size={24} color={colors.textInverse} />
              <PromoteLabel large={large} numberOfLines={large ? 1 : 2}>
                {t('promoteListingTileLabel')}
              </PromoteLabel>
            </PromoteTile>
          ) : (
            <CategoryTile
              icon={item.icon}
              label={language === 'en' ? item.labelEn : item.labelFr}
              large={large}
              wide={wide}
              onPress={() =>
                item.key === 'pharmacyOnDuty'
                  ? navigation.navigate('CategoryListings', {
                      categoryKey: item.key,
                      labelEn: item.labelEn,
                      labelFr: item.labelFr,
                    })
                  : navigation.navigate('CreateListing', { categoryKey: item.key, isPromoted: false })
              }
            />
          );
        }}
      />
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const ProfileRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const MyListingsLink = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
  ${shadow.card}
`;

const MyListingsLinkLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.primary};
  flex: 1;
`;

const AvatarButton = styled(Pressable)`
  width: 68px;
  height: 68px;
`;

const Avatar = styled(Image)`
  width: 68px;
  height: 68px;
  border-radius: ${radius.pill}px;
`;

const AvatarPlaceholder = styled.View`
  width: 68px;
  height: 68px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.primaryLight};
  align-items: center;
  justify-content: center;
`;

const AvatarEditBadge = styled.View`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background-color: ${(props) => props.theme.primary};
  align-items: center;
  justify-content: center;
  border-width: 2px;
  border-color: ${(props) => props.theme.background};
`;

const SellerName = styled.Text`
  ${type.h2}
  color: ${(props) => props.theme.text};
  flex: 1;
`;

function promoteWidthPercent(props) {
  if (props.large) return 100;
  if (props.wide) return 48;
  return 31;
}

const PromoteTile = styled.Pressable`
  width: ${(props) => promoteWidthPercent(props)}%;
  aspect-ratio: ${(props) => promoteWidthPercent(props) / 31};
  flex-direction: ${(props) => (props.large ? 'row' : 'column')};
  background-color: ${(props) => props.theme.accent};
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.sm}px;
  gap: ${(props) => (props.large ? spacing.sm : spacing.xs)}px;
  ${shadow.card}
`;

const PromoteLabel = styled.Text`
  ${(props) => (props.large ? type.bodyMedium : type.caption)}
  color: ${(props) => props.theme.textInverse};
  text-align: center;
`;
