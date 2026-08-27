import styled from "styled-components/native";
import { spacing } from "../theme/colors";
import { fontFamily } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import appJson from "../../app.json";

// The end of a screen, said out loud.
//
// Long scrolls just stopped. On a feed that ends with a half-empty row of
// deals there is no way to tell "you have reached the bottom" from "the rest
// is still loading", and the reader keeps pulling at a list that has nothing
// left to give.
//
// Deliberately not a web footer. There is no Conditions or Confidentialité
// link here because those screens do not exist yet — MoreScreen's privacy row
// still answers "bientôt disponible", and a link that dead-ends at the very
// bottom of every screen would be the most-seen broken promise in the app.
// When those pages are built this is where they go.
//
// The version is read from app.json rather than typed. A hardcoded "1.0.0"
// is right exactly once, and wrong silently forever after — and the number is
// only worth showing at all because it is the first thing to ask for when
// somebody reports something that cannot be reproduced.
const APP_NAME = appJson.expo.name;
const APP_VERSION = appJson.expo.version;

export function ScreenFooter({ style }) {
  const { t } = useI18n();
  return (
    <Footer style={style}>
      <Rule />
      <Wordmark>{APP_NAME.toUpperCase()}</Wordmark>
      <Line>{t("footerLine")}</Line>
      <Version>{`v${APP_VERSION}`}</Version>
    </Footer>
  );
}

const Footer = styled.View`
  align-items: center;
  padding: ${spacing.xl}px ${spacing.md}px ${spacing.lg}px;
`;

// A short rule rather than a full-width divider: this closes the content, it
// does not separate two things.
const Rule = styled.View`
  width: 34px;
  height: 2px;
  border-radius: 1px;
  margin-bottom: ${spacing.md}px;
  background-color: ${(props) => props.theme.border};
`;

const Wordmark = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 13px;
  letter-spacing: 2.5px;
  color: ${(props) => props.theme.textMuted};
`;

const Line = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 12px;
  line-height: 17px;
  text-align: center;
  margin-top: 6px;
  color: ${(props) => props.theme.textMuted};
`;

const Version = styled.Text`
  font-family: ${fontFamily.regular};
  font-size: 11px;
  margin-top: ${spacing.sm}px;
  color: ${(props) => props.theme.textMuted};
  opacity: 0.7;
`;
