import { useI18n } from '../i18n/I18nContext';

// The dial codes the app accepts, in one place.
//
// Sign-up, login and password recovery each carried their own identical
// copy, which is how a list like this drifts: add a country to one screen
// and someone can create an account they then cannot recover.
export function useCountries() {
  const { t } = useI18n();
  return [
    { flag: '🇧🇯', name: t('countryBenin'), dial: '+229' },
    { flag: '🇹🇬', name: t('countryTogo'), dial: '+228' },
    { flag: '🇲🇱', name: t('countryMali'), dial: '+223' },
    { flag: '🇨🇮', name: t('countryIvoryCoast'), dial: '+225' },
    { flag: '🇸🇳', name: t('countrySenegal'), dial: '+221' },
  ];
}
