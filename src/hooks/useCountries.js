import { useMemo } from "react";
import { useI18n } from "../i18n/I18nContext";
import { countries as ALL, POSTING_COUNTRY } from "../data/countries";

// The dial codes the app accepts, in one place.
//
// Sign-up, login and password recovery each carried their own identical
// copy, which is how a list like this drifts: add a country to one screen and
// someone can create an account they then cannot recover.
//
// Everywhere on earth is here. Anyone may hold an account and read the whole
// market; publishing a listing is a separate question, decided by the number
// itself and enforced server-side (see canPublish.js and firestore.rules).
//
// Bénin sits first regardless of alphabet. Almost every account is Béninese,
// and putting the common answer at the top of a 245-row sheet is worth more
// than the tidiness of a single ordering.
export function useCountries() {
  const { language } = useI18n();

  return useMemo(() => {
    const named = ALL.map((item) => ({
      ...item,
      name: language === "en" ? item.nameEn : item.nameFr,
    }));
    const home = named.filter((item) => item.code === POSTING_COUNTRY);
    const rest = named
      .filter((item) => item.code !== POSTING_COUNTRY)
      .sort((a, b) =>
        a.name.localeCompare(b.name, language === "en" ? "en" : "fr"),
      );
    return [...home, ...rest];
  }, [language]);
}
