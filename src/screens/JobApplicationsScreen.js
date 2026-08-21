import { FlatList, Linking, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { radius, shadow, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, type } from '../theme/typography';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useJobApplications } from '../hooks/useJobApplications';
import { PhoneCallButtons } from '../components/PhoneCallButtons';
import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import {
  applicationStatuses,
  getApplicationStatusColor,
  getApplicationStatusLabel,
  getApplicationStatusTint,
} from '../data/applicationStatuses';

const EMERALD = '#0B6E4F';

function formatTimestamp(date, language) {
  if (!date) return '';
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
}

// Where a seller actually sees who applied to their real job postings —
// the other half of JobDetailScreen's "Postuler maintenant" flow. Reads
// jobApplications by employerUid (see firestore.rules), across every job
// the seller has posted, newest first.
export function JobApplicationsScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user } = useAuth();
  const applications = useJobApplications(user?.uid);

  // Only `status` is writable here, and only by the employer — see
  // firestore.rules, which pins every other field. Failures are swallowed
  // deliberately: the list is driven by a live snapshot, so a rejected
  // write simply leaves the pill where it was rather than desyncing.
  const setApplicationStatus = (applicationId, status) => {
    updateDoc(doc(firestore, 'jobApplications', applicationId), { status }).catch(() => {});
  };

  return (
    <Container edges={['top', 'left', 'right', 'bottom']}>
      <Header>
        <BackButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </BackButton>
        <HeaderTitle>{t('jobApplicationsTitle')}</HeaderTitle>
      </Header>

      <FlatList
        data={applications ?? []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          applications !== null ? (
            <EmptyState>
              <Ionicons name="mail-open-outline" size={40} color={colors.textMuted} />
              <EmptyTitle>{t('jobApplicationsEmptyTitle')}</EmptyTitle>
              <EmptySubtitle>{t('jobApplicationsEmptySubtitle')}</EmptySubtitle>
            </EmptyState>
          ) : null
        }
        renderItem={({ item }) => (
          <ApplicationCard>
            <CardTopRow>
              <ApplicantName numberOfLines={1}>
                {item.applicantName?.trim() || t('jobApplicationsAnonymousApplicant')}
              </ApplicantName>
              <StatusPill tint={getApplicationStatusTint(item.status, colors)}>
                <StatusPillLabel accent={getApplicationStatusColor(item.status, colors)}>
                  {getApplicationStatusLabel(item.status, language)}
                </StatusPillLabel>
              </StatusPill>
            </CardTopRow>
            <JobLabel numberOfLines={1}>
              {t('jobApplicationsForLabel', { title: item.jobTitle ?? '' })}
            </JobLabel>
            <MetaRow>
              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
              <MetaText>{formatTimestamp(item.createdAt?.toDate?.(), language)}</MetaText>
              {item.hasCv && !item.cvUrl ? (
                <>
                  <MetaDot>·</MetaDot>
                  <Ionicons name="document-attach-outline" size={12} color={EMERALD} />
                  <MetaTextAccent>{t('jobApplicationsCvIncluded')}</MetaTextAccent>
                </>
              ) : null}
            </MetaRow>
            <MessageText numberOfLines={4}>
              {item.applicantMessage?.trim() || t('jobApplicationsNoMessage')}
            </MessageText>
            {item.cvUrl ? (
              <CvLinkRow onPress={() => Linking.openURL(item.cvUrl)}>
                <Ionicons name="document-attach-outline" size={14} color={EMERALD} />
                <CvLinkText numberOfLines={1}>{item.cvFileName || t('jobApplicationsCvIncluded')}</CvLinkText>
                <Ionicons name="open-outline" size={14} color={EMERALD} />
              </CvLinkRow>
            ) : null}
            {item.applicantPhone ? (
              <PhoneCallButtons phone={item.applicantPhone} size="sm" style={callButtonsStyle} />
            ) : null}

            <StatusRow>
              {applicationStatuses
                .filter((status) => status.key !== 'new')
                .map((status) => {
                  const active = (item.status ?? 'new') === status.key;
                  return (
                    <StatusButton
                      key={status.key}
                      active={active}
                      accent={getApplicationStatusColor(status.key, colors)}
                      tint={getApplicationStatusTint(status.key, colors)}
                      onPress={() => setApplicationStatus(item.id, active ? 'new' : status.key)}
                    >
                      <Ionicons
                        name={status.icon}
                        size={14}
                        color={active ? getApplicationStatusColor(status.key, colors) : colors.textMuted}
                      />
                      <StatusButtonLabel
                        active={active}
                        accent={getApplicationStatusColor(status.key, colors)}
                        numberOfLines={1}
                      >
                        {getApplicationStatusLabel(status.key, language)}
                      </StatusButtonLabel>
                    </StatusButton>
                  );
                })}
            </StatusRow>
          </ApplicationCard>
        )}
      />
    </Container>
  );
}

const listContentStyle = { padding: spacing.md, flexGrow: 1 };
const callButtonsStyle = { marginTop: spacing.sm };

const CardTopRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: 2px;
`;

const StatusPill = styled.View`
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.tint};
`;

const StatusPillLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 10.5px;
  color: ${(props) => props.accent};
`;

// Tapping the active state again returns the application to "new" — an
// employer who marks the wrong row needs a way back, and there's no undo
// anywhere else in this screen.
const StatusRow = styled.View`
  flex-direction: row;
  gap: 6px;
  margin-top: ${spacing.sm}px;
`;

const StatusButton = styled(Pressable)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px 6px;
  border-radius: ${radius.md}px;
  background-color: ${(props) => (props.active ? props.tint : props.theme.surfaceAlt)};
  border-width: 1px;
  border-color: ${(props) => (props.active ? props.accent : 'transparent')};
`;

const StatusButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 11px;
  color: ${(props) => (props.active ? props.accent : props.theme.textMuted)};
`;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
`;

const BackButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 17px;
  color: ${(props) => props.theme.text};
`;

const EmptyState = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-horizontal: ${spacing.xl}px;
  padding-top: 80px;
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

const ApplicationCard = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.sm}px;
  ${shadow.card}
`;

const ApplicantName = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const JobLabel = styled.Text`
  ${type.caption}
  color: ${EMERALD};
  margin-top: 2px;
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin-top: ${spacing.xs}px;
`;

const MetaText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const MetaTextAccent = styled.Text`
  ${type.caption}
  color: ${EMERALD};
  font-weight: 600;
`;

const MetaDot = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const MessageText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
  margin-top: ${spacing.sm}px;
  line-height: 20px;
`;

const CvLinkRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-top: ${spacing.sm}px;
  padding: 7px ${spacing.sm}px;
  border-radius: ${radius.pill}px;
  background-color: rgba(11, 110, 79, 0.08);
  max-width: 100%;
`;

const CvLinkText = styled.Text`
  ${type.captionMedium}
  color: ${EMERALD};
  flex-shrink: 1;
  text-decoration-line: underline;
`;
