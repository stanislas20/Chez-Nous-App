import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { type } from '../theme/typography';
import { mockJobs } from '../data/mockJobs';
import { useI18n } from '../i18n/I18nContext';

const listContentStyle = { padding: spacing.md };

export function JobsScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();

  return (
    <Container edges={['left', 'right']}>
      <Subtitle>{t('jobsSubtitle')}</Subtitle>
      <FlatList
        data={mockJobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={listContentStyle}
        renderItem={({ item }) => (
          <Card>
            <IconWrap>
              <Ionicons name="briefcase-outline" size={22} color={colors.primary} />
            </IconWrap>
            <Details>
              <Title>{language === 'en' ? item.titleEn : item.titleFr}</Title>
              <Company>{item.company}</Company>
              <Meta>
                {item.city} · {language === 'en' ? item.typeEn : item.typeFr}
              </Meta>
            </Details>
          </Card>
        )}
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
  padding-bottom: ${spacing.xs}px;
`;

const Card = styled.View`
  flex-direction: row;
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.md}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  gap: ${spacing.md}px;
  ${shadow.card}
`;

const IconWrap = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: ${(props) => props.theme.primaryLight};
  align-items: center;
  justify-content: center;
`;

const Details = styled.View`
  flex: 1;
`;

const Title = styled.Text`
  ${type.h3}
  color: ${(props) => props.theme.text};
`;

const Company = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.text};
  margin-top: 2px;
`;

const Meta = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 4px;
`;
