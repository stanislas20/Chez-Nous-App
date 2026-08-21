import { useState } from 'react';
import { Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { firestore } from '../config/firebase';
import { categories } from '../data/categories';
import { cities } from '../data/cities';
import { cityCoordinates } from '../data/cityCoordinates';

export function EditListingScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { listing } = route.params;
  const { t, language } = useI18n();

  const category = categories.find((c) => c.key === listing.categoryKey) ?? null;
  const isPharmacy = listing.categoryKey === 'pharmacyOnDuty';
  const isJobs = listing.categoryKey === 'jobs';

  const [title, setTitle] = useState(listing.titleEn ?? '');
  const [price, setPrice] = useState(String(listing.price ?? ''));
  const [phone, setPhone] = useState(listing.phone ?? '');
  const [dutyHours, setDutyHours] = useState('');
  const [description, setDescription] = useState(listing.descriptionEn ?? '');
  const [selectedCity, setSelectedCity] = useState(listing.city ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !selectedCity) {
      Alert.alert(t('editListingTitle'), t('errorRequiredFields'));
      return;
    }

    let numericPrice = listing.price ?? 0;
    let numericDutyHours = 0;
    if (isPharmacy) {
      if (!phone.trim()) {
        Alert.alert(t('editListingTitle'), t('errorPhoneRequired'));
        return;
      }
      if (dutyHours.trim()) {
        numericDutyHours = Number(dutyHours);
        if (Number.isNaN(numericDutyHours) || numericDutyHours <= 0) {
          Alert.alert(t('editListingTitle'), t('errorInvalidDutyHours'));
          return;
        }
      }
    } else {
      numericPrice = Number(price);
      if (!price.trim() || Number.isNaN(numericPrice) || numericPrice <= 0) {
        Alert.alert(t('editListingTitle'), t('errorInvalidPrice'));
        return;
      }
    }

    // A real price drop (not a fabricated "deal") — surfaced on the ForYou
    // home feed's "Deals ending soon" section as an honest old-vs-new price.
    const isPriceDrop = !isPharmacy && listing.price != null && numericPrice < listing.price;

    setIsSubmitting(true);
    try {
      const coords = cityCoordinates[selectedCity] ?? null;
      await updateDoc(doc(firestore, 'listings', listing.id), {
        titleEn: title.trim(),
        titleFr: title.trim(),
        descriptionEn: description.trim(),
        descriptionFr: description.trim(),
        price: numericPrice,
        previousPrice: isPriceDrop ? listing.price : null,
        priceDroppedAt: isPriceDrop ? serverTimestamp() : null,
        ...(isPharmacy
          ? {
              phone: phone.trim(),
              ...(numericDutyHours > 0
                ? { dutyUntil: Timestamp.fromMillis(Date.now() + numericDutyHours * 60 * 60 * 1000) }
                : null),
            }
          : null),
        city: selectedCity,
        latitude: coords?.latitude ?? listing.latitude ?? null,
        longitude: coords?.longitude ?? listing.longitude ?? null,
      });
      Alert.alert(t('editListingTitle'), t('editListingSuccessMessage'), [
        { text: t('continue'), onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert(t('editListingTitle'), t('errorGeneric'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container edges={['left', 'right']}>
      <Content>
        <Label>{t('sellFieldTitle')}</Label>
        <InputRow>
          <Ionicons name="pricetag-outline" size={20} color={colors.textMuted} />
          <Input
            value={title}
            onChangeText={setTitle}
            placeholder={t(isJobs ? 'sellFieldTitlePlaceholderJobs' : 'sellFieldTitlePlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </InputRow>

        {isPharmacy ? (
          <>
            <Label>{t('sellFieldPhone')}</Label>
            <InputRow>
              <Ionicons name="call-outline" size={20} color={colors.textMuted} />
              <Input
                value={phone}
                onChangeText={setPhone}
                placeholder={t('sellFieldPhonePlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />
            </InputRow>

            <Label>{t('sellFieldDutyHours')}</Label>
            <InputRow>
              <Ionicons name="time-outline" size={20} color={colors.textMuted} />
              <Input
                value={dutyHours}
                onChangeText={setDutyHours}
                placeholder={t('sellFieldDutyHoursPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </InputRow>
          </>
        ) : (
          <>
            <Label>{t('sellFieldPrice')}</Label>
            <InputRow>
              <Ionicons name="cash-outline" size={20} color={colors.textMuted} />
              <Input
                value={price}
                onChangeText={setPrice}
                placeholder={t('sellFieldPricePlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </InputRow>
          </>
        )}

        {category ? (
          <>
            <Label>{t('sellFieldCategory')}</Label>
            <PresetCategoryPill>
              <Ionicons name={category.icon} size={16} color={colors.primaryDark} />
              <PresetCategoryLabel>
                {language === 'en' ? category.labelEn : category.labelFr}
              </PresetCategoryLabel>
            </PresetCategoryPill>
          </>
        ) : null}

        <Label>{t('sellFieldLocation')}</Label>
        <ChipRow horizontal showsHorizontalScrollIndicator={false}>
          {cities.map((city) => (
            <Chip key={city} selected={selectedCity === city} onPress={() => setSelectedCity(city)}>
              <ChipLabel selected={selectedCity === city}>{city}</ChipLabel>
            </Chip>
          ))}
        </ChipRow>

        <Label>{t('sellFieldDescription')}</Label>
        <TextAreaRow>
          <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
          <TextArea
            value={description}
            onChangeText={setDescription}
            placeholder={t('sellFieldDescriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
          />
        </TextAreaRow>

        <SubmitButton onPress={handleSubmit} disabled={isSubmitting}>
          <SubmitLabel>{isSubmitting ? t('adUploadingLabel') : t('editListingSubmitButton')}</SubmitLabel>
        </SubmitButton>
      </Content>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Content = styled.ScrollView.attrs(() => ({
  contentContainerStyle: { padding: spacing.md },
  showsVerticalScrollIndicator: false,
}))``;

const Label = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-top: ${spacing.md}px;
  margin-bottom: ${spacing.xs}px;
`;

const InputRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  ${shadow.card}
`;

const Input = styled.TextInput`
  flex: 1;
  padding-vertical: 10px;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const TextAreaRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  background-color: ${(props) => props.theme.surface};
  border-width: 1px;
  border-color: ${(props) => props.theme.border};
  border-radius: ${radius.lg}px;
  padding-horizontal: ${spacing.md}px;
  padding-top: ${spacing.md}px;
  ${shadow.card}
`;

const TextArea = styled.TextInput`
  flex: 1;
  height: 100px;
  text-align-vertical: top;
  ${type.body}
  font-size: 16px;
  color: ${(props) => props.theme.text};
`;

const ChipRow = styled.ScrollView`
  flex-direction: row;
`;

const Chip = styled(Pressable)`
  background-color: ${(props) => (props.selected ? props.theme.primary : props.theme.surface)};
  border-width: 1px;
  border-color: ${(props) => (props.selected ? props.theme.primary : props.theme.border)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.xs}px;
  margin-right: ${spacing.sm}px;
  ${shadow.card}
`;

const ChipLabel = styled.Text`
  ${(props) => (props.selected ? type.captionMedium : type.caption)}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;

const PresetCategoryPill = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  align-self: flex-start;
  background-color: ${(props) => props.theme.primaryLight};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.sm}px;
`;

const PresetCategoryLabel = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.primaryDark};
`;

const SubmitButton = styled(Pressable)`
  background-color: ${(props) => props.theme.primary};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.md}px;
  align-items: center;
  margin-top: ${spacing.xl}px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};
`;

const SubmitLabel = styled.Text`
  ${type.button}
  color: ${(props) => props.theme.textInverse};
`;
