import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ensureCameraAccess } from "../utils/mediaAccess";
import * as Print from "expo-print";
import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily, type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { firestore, storage } from "../config/firebase";
import { useJobFavorites } from "../hooks/useJobFavorites";
import { useSellerListings } from "../hooks/useSellerListings";
import { useJobApplications } from "../hooks/useJobApplications";
import { canPublish } from "../utils/canPublish";
import { POSTING_DIAL } from "../data/countries";
import { jobCategories } from "../data/jobCategories";
import {
  getExperienceAccent,
  getExperienceLabel,
  getExperienceLevel,
  getExperienceTint,
} from "../data/jobExperience";
import { mockJobs } from "../data/mockJobs";
import { getTodayDateString } from "../utils/listingLifecycle";
import { openChat } from "../utils/openChat";
import { openAccountGate } from "../utils/openAccountGate";

const EMERALD = "#0B6E4F";
const GOLD = "#D9A441";

// Both bottom actions are real for real (Firestore-backed) postings:
// applying writes to jobApplications, and contacting opens the same
// conversation thread ProductDetailScreen uses, so an employer receives it
// in the inbox they already watch. For the 5 static mockJobs.js sample
// postings there's no employer account behind them, so both paths say so
// plainly rather than appearing to send somewhere.
export function JobDetailScreen({ navigation, route }) {
  const { job } = route.params;
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user, sellerProfile } = useAuth();
  const { favoriteIds, toggleFavorite } = useJobFavorites(user?.uid);
  const insets = useSafeAreaInsets();

  const [applySheetOpen, setApplySheetOpen] = useState(false);
  const [applySubmitted, setApplySubmitted] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [cvAsset, setCvAsset] = useState(null);
  const [cvSourceSheetOpen, setCvSourceSheetOpen] = useState(false);
  const [cvProcessing, setCvProcessing] = useState(false);
  const [applyPhone, setApplyPhone] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const sellerJobListings = useSellerListings(job.isReal ? job.sellerId : null);

  const title = language === "en" ? job.titleEn : job.titleFr;
  const jobType = language === "en" ? job.typeEn : job.typeFr;
  const salary = language === "en" ? job.salaryEn : job.salaryFr;
  const posted = language === "en" ? job.postedEn : job.postedFr;
  const description = language === "en" ? job.descriptionEn : job.descriptionFr;
  const responsibilities =
    language === "en" ? job.responsibilitiesEn : job.responsibilitiesFr;
  const requirements =
    language === "en" ? job.requirementsEn : job.requirementsFr;
  const benefits = language === "en" ? job.benefitsEn : job.benefitsFr;
  const category = jobCategories.find((c) => c.key === job.category);
  const categoryLabel = category
    ? language === "en"
      ? category.labelEn
      : category.labelFr
    : null;
  const isFav = favoriteIds.has(job.id);
  const isNew = job.postedDaysAgo < 1;
  // Falls back to the old wording only for legacy postings that recorded
  // nothing but `noExp: false` — those stated no band, so they can't claim
  // one.
  const experienceKey = getExperienceLevel(job);
  const experienceLabel =
    getExperienceLabel(experienceKey, language) ??
    t("jobDetailExperienceRequired");
  // Counted from real data either way — the seller's other approved job
  // listings for a real posting, or the static sample dataset for a mock
  // one — never a made-up figure.
  const activeJobsCount = job.isReal
    ? (sellerJobListings ?? []).filter((l) => l.categoryKey === "jobs").length
    : mockJobs.filter((j) => j.company === job.company).length;

  const isOwner = job.isReal && !!user && user.uid === job.sellerId;
  // Only subscribed when the poster is looking at their own posting — a
  // candidate has no reason to see (or be able to read, per firestore.rules)
  // another person's application list.
  const ownApplications = useJobApplications(isOwner ? job.sellerId : null);
  const applicationsForThisJob = (ownApplications ?? []).filter(
    (a) => a.jobId === job.id,
  );

  // One increment per real visit — skip the poster's own views (shouldn't
  // inflate their own count) and anything that isn't a real, persisted
  // posting (mockJobs.js ids don't exist in Firestore, so this write would
  // just fail security rules harmlessly, but skip it outright anyway).
  const hasCountedView = useRef(false);
  useEffect(() => {
    if (hasCountedView.current) return;
    if (!job.isReal || isOwner) return;
    hasCountedView.current = true;
    const today = getTodayDateString();
    const isSameDay = job.viewCountDate === today;
    updateDoc(doc(firestore, "listings", job.id), {
      viewCount: increment(1),
      viewCountToday: isSameDay ? increment(1) : 1,
      viewCountDate: today,
    }).catch(() => {
      // Non-critical — a missed view count shouldn't disrupt browsing.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const onToggleFavorite = () => {
    if (!user) {
      Alert.alert(t("favoritesSignInTitle"), t("favoritesSignInMessage"));
      return;
    }
    toggleFavorite(job.id);
  };

  // Reuses openChat rather than a job-specific thread: a posting IS a
  // listing in Firestore, so the conversation it opens lands in the same
  // inbox, with the same unread counts, as any other enquiry.
  const handleContact = () => {
    if (!job.isReal || !job.sellerId) {
      Alert.alert(
        t("jobDetailContactButton"),
        t("jobDetailApplySuccessSubtitle"),
      );
      return;
    }
    openChat({ listing: job, listingTitle: title, user, navigation, t });
  };

  const onShare = () => {
    Share.share({ message: `${title} — ${job.company} (${job.city})` }).catch(
      () => {},
    );
  };

  // Same "search by name, don't pretend to have a pinned address" pattern
  // BanksScreen uses — there's no verified street address for these
  // postings either.
  const openInMaps = () => {
    const query = encodeURIComponent(`${job.company} ${job.city} Bénin`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  const openApplySheet = () => {
    if (!user) {
      Alert.alert(
        t("jobDetailApplySignInTitle"),
        t("jobDetailApplySignInMessage"),
      );
      return;
    }
    // Applying writes to the market, so it follows the same rule as
    // publishing. Said here rather than letting the sheet open onto a
    // submission the database will refuse — filling in a CV and a covering
    // message first would make the refusal cost something.
    if (!canPublish(user)) {
      Alert.alert(
        t("postingCountryTitle"),
        t("jobDetailApplyCountryMessage", { dial: POSTING_DIAL }),
      );
      return;
    }
    // Deliberately doesn't clear the CV/phone/message draft here — an
    // accidental tap on the backdrop closes this sheet (it's meant to be
    // dismissible), and re-opening it should pick right back up where they
    // left off instead of forcing them to redo everything. The draft only
    // ever gets cleared after a real, successful submission (which is also
    // the only place applySubmitted needs resetting back to false again).
    setApplySubmitted(false);
    setApplySheetOpen(true);
  };

  const pickCvFile = async () => {
    setCvSourceSheetOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setCvAsset(asset);
    } catch {
      Alert.alert(
        t("jobDetailCvPickErrorTitle"),
        t("jobDetailCvPickErrorMessage"),
      );
    }
  };

  // Turns one or more captured/selected photos into a single, real PDF
  // (one page per photo) so a scanned or photographed CV reaches the
  // employer as an actual document, the same as a picked PDF file would —
  // not a pile of loose image attachments.
  const buildCvPdfFromImages = async (uris) => {
    const pagesHtml = uris
      .map(
        (uri) =>
          `<div style="page-break-after: always; width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center;"><img src="${uri}" style="max-width: 100%; max-height: 100%; object-fit: contain;" /></div>`,
      )
      .join("");
    const { uri: pdfUri } = await Print.printToFileAsync({
      html: `<html><body style="margin:0;">${pagesHtml}</body></html>`,
    });
    return pdfUri;
  };

  const finishCvFromImages = async (uris) => {
    if (uris.length === 0) return;
    setCvProcessing(true);
    try {
      const pdfUri = await buildCvPdfFromImages(uris);
      setCvAsset({
        uri: pdfUri,
        name: `CV-${Date.now()}.pdf`,
        mimeType: "application/pdf",
      });
    } catch {
      Alert.alert(
        t("jobDetailCvPickErrorTitle"),
        t("jobDetailCvPickErrorMessage"),
      );
    } finally {
      setCvProcessing(false);
    }
  };

  // Loops the camera so a multi-page CV can be captured page by page —
  // asks after each shot rather than forcing a fixed page count, since a
  // real resume can be one page or several.
  const scanCvWithCamera = async () => {
    setCvSourceSheetOpen(false);
    const allowed = await ensureCameraAccess({
      t,
      title: t("jobDetailCameraPermissionTitle"),
    });
    if (!allowed) return;
    const pages = [];
    let keepScanning = true;
    while (keepScanning) {
      // eslint-disable-next-line no-await-in-loop
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (result.canceled) break;
      const asset = result.assets?.[0];
      if (asset) pages.push(asset.uri);
      // eslint-disable-next-line no-await-in-loop
      keepScanning = await new Promise((resolve) => {
        Alert.alert(
          t("jobDetailScanAnotherPageTitle"),
          t("jobDetailScanAnotherPageMessage"),
          [
            { text: t("jobDetailScanFinish"), onPress: () => resolve(false) },
            { text: t("jobDetailScanAddPage"), onPress: () => resolve(true) },
          ],
          { cancelable: false },
        );
      });
    }
    await finishCvFromImages(pages);
  };

  const pickCvFromGallery = async () => {
    setCvSourceSheetOpen(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      // MediaTypeOptions is gone in this SDK — an array of strings now.
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    await finishCvFromImages((result.assets ?? []).map((asset) => asset.uri));
  };

  const applyDisabled = applyPhone.trim().length < 8 || applySubmitting;

  const submitApplication = async () => {
    // Only a real (Firestore-backed) posting has a real employer to
    // deliver to — the mockJobs.js sample postings just show the same
    // success screen with an honest "nothing was actually sent" note.
    if (!job.isReal || !job.sellerId) {
      setApplySubmitted(true);
      setCvAsset(null);
      setApplyPhone("");
      setApplyMessage("");
      return;
    }
    setApplySubmitting(true);
    try {
      // A real, downloadable file the employer can actually open — not just
      // a "CV attached" boolean with nothing behind it.
      let cvUrl = null;
      let cvFileName = null;
      if (cvAsset) {
        const extension = cvAsset.name?.split(".").pop() || "pdf";
        const storageRef = ref(
          storage,
          `jobApplicationCvs/${user.uid}/${Date.now()}.${extension}`,
        );
        const response = await fetch(cvAsset.uri);
        const blob = await response.blob();
        await new Promise((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, blob, {
            contentType: cvAsset.mimeType || "application/pdf",
          });
          uploadTask.on("state_changed", null, reject, resolve);
        });
        cvUrl = await getDownloadURL(storageRef);
        cvFileName = cvAsset.name || null;
      }

      await addDoc(collection(firestore, "jobApplications"), {
        jobId: job.id,
        jobTitle: title,
        company: job.company,
        employerUid: job.sellerId,
        applicantUid: user.uid,
        applicantName: sellerProfile?.fullName ?? "",
        applicantPhone: applyPhone.trim(),
        applicantMessage: applyMessage.trim(),
        hasCv: Boolean(cvUrl),
        cvUrl,
        cvFileName,
        status: "new",
        createdAt: serverTimestamp(),
      });
      setApplySubmitted(true);
      setCvAsset(null);
      setApplyPhone("");
      setApplyMessage("");
    } catch {
      Alert.alert(
        t("jobDetailApplyErrorTitle"),
        t("jobDetailApplyErrorMessage"),
      );
    } finally {
      setApplySubmitting(false);
    }
  };

  const handleReport = () => {
    if (!user) {
      // Reporting requires an account: firestore.rules pins reporterId to
      // the caller, and a report worth acting on needs someone moderation
      // can come back to.
      Alert.alert(
        t("reportSignUpRequiredTitle"),
        t("reportSignUpRequiredMessage"),
        [
          { text: t("cancel"), style: "cancel" },
          {
            text: t("signUpButton"),
            onPress: () => openAccountGate(navigation),
          },
        ],
      );
      return;
    }
    navigation.navigate("ReportListing", {
      listingId: job.id,
      listingTitle: job.title ?? "",
    });
  };

  return (
    <Container edges={["top", "left", "right", "bottom"]}>
      <Header>
        <IconButton onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </IconButton>
        <HeaderTitle numberOfLines={1}>{t("jobDetailHeaderTitle")}</HeaderTitle>
        {user ? (
          <CircleIconButton onPress={onToggleFavorite} hitSlop={8}>
            <Ionicons
              name={isFav ? "heart" : "heart-outline"}
              size={18}
              color={isFav ? "#D64545" : colors.text}
            />
          </CircleIconButton>
        ) : null}
        <CircleIconButton onPress={onShare} hitSlop={8}>
          <Ionicons name="share-social-outline" size={18} color={colors.text} />
        </CircleIconButton>
      </Header>

      <Body
        showsVerticalScrollIndicator={false}
        contentContainerStyle={bodyContentStyle}
      >
        <HeroRow>
          <LogoGradient
            colors={[EMERALD, GOLD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <LogoLabel>{job.company.charAt(0)}</LogoLabel>
          </LogoGradient>
          <HeroInfo>
            <HeroTitle>{title}</HeroTitle>
            <HeroCompanyRow>
              <HeroCompanyText>{job.company}</HeroCompanyText>
              {job.verified ? (
                <Ionicons name="checkmark-circle" size={13} color={EMERALD} />
              ) : null}
            </HeroCompanyRow>
            <HeroMetaRow>
              <Ionicons
                name="location-outline"
                size={11}
                color={colors.textMuted}
              />
              <HeroMetaText>{job.city}</HeroMetaText>
              <HeroMetaText>·</HeroMetaText>
              <HeroMetaText>{posted}</HeroMetaText>
            </HeroMetaRow>
          </HeroInfo>
        </HeroRow>

        <TagsRow>
          {isNew ? (
            <Tag accent>
              <Ionicons name="sparkles" size={11} color={EMERALD} />
              <TagLabel accent numberOfLines={1}>
                {t("jobsNewTag")}
              </TagLabel>
            </Tag>
          ) : null}
          <Tag>
            <TagLabel numberOfLines={1}>{jobType}</TagLabel>
          </Tag>
          {categoryLabel ? (
            <Tag>
              <TagLabel numberOfLines={1}>{categoryLabel}</TagLabel>
            </Tag>
          ) : null}
          {experienceKey ? (
            <Tag tint={getExperienceTint(experienceKey, colors)}>
              <ExperienceDot
                color={getExperienceAccent(experienceKey, colors)}
              />
              <TagLabel
                color={getExperienceAccent(experienceKey, colors)}
                numberOfLines={1}
              >
                {getExperienceLabel(experienceKey, language)}
              </TagLabel>
            </Tag>
          ) : null}
        </TagsRow>

        {salary ? (
          <SalaryCard>
            <SalaryIconWrap>
              <Ionicons name="cash-outline" size={18} color={EMERALD} />
            </SalaryIconWrap>
            <View>
              <SalaryLabel>{t("jobDetailSalaryLabel")}</SalaryLabel>
              <SalaryValue>{salary}</SalaryValue>
            </View>
          </SalaryCard>
        ) : null}

        <SectionTitle>{t("jobDetailInfoSection")}</SectionTitle>
        <FactsGrid>
          <FactItem>
            <FactIconWrap>
              <Ionicons name="briefcase-outline" size={16} color={EMERALD} />
            </FactIconWrap>
            <FactTextCol>
              <FactLabel>{t("jobDetailTypeLabel")}</FactLabel>
              <FactValue numberOfLines={1}>{jobType}</FactValue>
            </FactTextCol>
          </FactItem>
          <FactItem>
            <FactIconWrap>
              <Ionicons name="person-outline" size={16} color={EMERALD} />
            </FactIconWrap>
            <FactTextCol>
              <FactLabel>{t("jobDetailExperienceLabel")}</FactLabel>
              <FactValue numberOfLines={1}>{experienceLabel}</FactValue>
            </FactTextCol>
          </FactItem>
          <FactItem>
            <FactIconWrap>
              <Ionicons name="location-outline" size={16} color={EMERALD} />
            </FactIconWrap>
            <FactTextCol>
              <FactLabel>{t("jobDetailLocationLabel")}</FactLabel>
              <FactValue numberOfLines={1}>{job.city}</FactValue>
            </FactTextCol>
          </FactItem>
          <FactItem>
            <FactIconWrap>
              <Ionicons name="pricetag-outline" size={16} color={EMERALD} />
            </FactIconWrap>
            <View>
              <FactLabel>{t("jobDetailSectorLabel")}</FactLabel>
              <FactValue>{categoryLabel}</FactValue>
            </View>
          </FactItem>
        </FactsGrid>

        <SectionTitle>{t("jobDetailAboutSection")}</SectionTitle>
        <Paragraph>{description}</Paragraph>

        {responsibilities?.length ? (
          <>
            <SectionTitle>{t("jobDetailResponsibilitiesSection")}</SectionTitle>
            <BulletList>
              {responsibilities.map((item) => (
                <BulletRow key={item}>
                  <BulletDot />
                  <BulletText>{item}</BulletText>
                </BulletRow>
              ))}
            </BulletList>
          </>
        ) : null}

        {requirements?.length ? (
          <>
            <SectionTitle>{t("jobDetailRequirementsSection")}</SectionTitle>
            <BulletList>
              {requirements.map((item) => (
                <BulletRow key={item}>
                  <BulletDot />
                  <BulletText>{item}</BulletText>
                </BulletRow>
              ))}
            </BulletList>
          </>
        ) : null}

        {benefits?.length ? (
          <>
            <SectionTitle>{t("jobDetailBenefitsSection")}</SectionTitle>
            <BulletList>
              {benefits.map((item) => (
                <BulletRow key={item}>
                  <BulletDot />
                  <BulletText>{item}</BulletText>
                </BulletRow>
              ))}
            </BulletList>
          </>
        ) : null}

        <SectionTitle>{t("jobDetailAboutCompanySection")}</SectionTitle>
        <CompanyCard>
          <CompanyLogoGradient
            colors={[EMERALD, GOLD]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <CompanyLogoLabel>{job.company.charAt(0)}</CompanyLogoLabel>
          </CompanyLogoGradient>
          <CompanyInfoCol>
            <CompanyNameRow>
              <CompanyName>{job.company}</CompanyName>
              {job.verified ? (
                <Ionicons name="checkmark-circle" size={13} color={EMERALD} />
              ) : null}
            </CompanyNameRow>
            <CompanySub>
              {job.city} ·{" "}
              {t(
                activeJobsCount === 1
                  ? "jobDetailActiveJobsCount"
                  : "jobDetailActiveJobsCountPlural",
                { count: activeJobsCount },
              )}
            </CompanySub>
          </CompanyInfoCol>
        </CompanyCard>

        <SectionTitle>{t("jobDetailWorkplaceSection")}</SectionTitle>
        <MapPreview>
          <ApproxPill numberOfLines={1}>{job.city}, Bénin</ApproxPill>
          <Ionicons name="location" size={26} color={EMERALD} />
        </MapPreview>
        <DirectionsButton onPress={openInMaps}>
          <Ionicons name="navigate-outline" size={14} color={EMERALD} />
          <DirectionsButtonLabel>
            {t("jobDetailViewOnMap")}
          </DirectionsButtonLabel>
        </DirectionsButton>

        <SafetyBox>
          <SafetyTitle>{t("jobDetailSafetyTitle")}</SafetyTitle>
          <SafetyTip>{t("jobDetailSafetyTip")}</SafetyTip>
        </SafetyBox>

        <ReportPressable onPress={handleReport}>
          <ReportRow>{t("jobDetailReportListing")}</ReportRow>
        </ReportPressable>
      </Body>

      {isOwner ? (
        <OwnerStatsDock style={{ paddingBottom: insets.bottom + spacing.sm }}>
          <OwnerStatItem>
            <Ionicons name="eye-outline" size={16} color={colors.textMuted} />
            <OwnerStatValue>{job.viewCount ?? 0}</OwnerStatValue>
            <OwnerStatLabel>{t("jobDetailViewsStat")}</OwnerStatLabel>
          </OwnerStatItem>
          <OwnerStatDivider />
          <OwnerStatItem>
            <Ionicons
              name="mail-open-outline"
              size={16}
              color={colors.textMuted}
            />
            <OwnerStatValue>{applicationsForThisJob.length}</OwnerStatValue>
            <OwnerStatLabel>{t("jobDetailApplicationsStat")}</OwnerStatLabel>
          </OwnerStatItem>
          <ViewApplicationsButton
            onPress={() => navigation.navigate("JobApplications")}
          >
            <ViewApplicationsButtonLabel>
              {t("jobDetailViewApplications")}
            </ViewApplicationsButtonLabel>
          </ViewApplicationsButton>
        </OwnerStatsDock>
      ) : (
        <CtaDock style={{ paddingBottom: insets.bottom + spacing.sm }}>
          <ContactButton onPress={handleContact}>
            <ContactButtonLabel>
              {t("jobDetailContactButton")}
            </ContactButtonLabel>
          </ContactButton>
          {canPublish(user) ? (
            <ApplyButton onPress={openApplySheet}>
              <ApplyButtonLabel>{t("jobDetailApplyButton")}</ApplyButtonLabel>
            </ApplyButton>
          ) : null}
        </CtaDock>
      )}

      <Modal
        visible={applySheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setApplySheetOpen(false)}
      >
        <KeyboardAvoidingView
          style={keyboardAvoidingStyle}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <SheetBackdrop onPress={() => setApplySheetOpen(false)}>
            <Sheet
              onStartShouldSetResponder={() => true}
              style={{ paddingBottom: insets.bottom + spacing.lg }}
            >
              <SheetHandle />
              {!applySubmitted ? (
                <ApplyFormScroll
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <SheetTitle>
                    {t("jobDetailApplySheetTitle", { title })}
                  </SheetTitle>
                  <CvRow
                    onPress={
                      cvAsset || cvProcessing
                        ? undefined
                        : () => setCvSourceSheetOpen(true)
                    }
                  >
                    <Ionicons
                      name={
                        cvAsset
                          ? "document-text-outline"
                          : "cloud-upload-outline"
                      }
                      size={16}
                      color={EMERALD}
                    />
                    <CvRowLabel numberOfLines={1}>
                      {cvProcessing
                        ? t("jobDetailCvProcessing")
                        : cvAsset
                          ? cvAsset.name
                          : t("jobDetailAddCv")}
                    </CvRowLabel>
                    {cvAsset && !cvProcessing ? (
                      <Pressable onPress={() => setCvAsset(null)} hitSlop={8}>
                        <Ionicons
                          name="close-circle"
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>
                    ) : null}
                  </CvRow>
                  <FieldGroup>
                    <FieldLabel>{t("fieldPhone")}</FieldLabel>
                    <InputWrap>
                      <StyledInput
                        value={applyPhone}
                        onChangeText={setApplyPhone}
                        keyboardType="phone-pad"
                        placeholder="01 23 45 67 89"
                        placeholderTextColor={colors.textMuted}
                      />
                    </InputWrap>
                  </FieldGroup>
                  <FieldGroup>
                    <FieldLabel>{t("jobDetailMessageLabel")}</FieldLabel>
                    <TextareaWrap>
                      <StyledTextarea
                        value={applyMessage}
                        onChangeText={setApplyMessage}
                        placeholder={t("jobDetailMessagePlaceholder")}
                        placeholderTextColor={colors.textMuted}
                        multiline
                      />
                    </TextareaWrap>
                  </FieldGroup>
                  <SubmitButton
                    disabled={applyDisabled}
                    onPress={submitApplication}
                  >
                    <SubmitButtonLabel>
                      {applySubmitting
                        ? t("jobDetailSubmitting")
                        : t("jobDetailSubmitApplication")}
                    </SubmitButtonLabel>
                  </SubmitButton>
                </ApplyFormScroll>
              ) : (
                <SuccessWrap>
                  <SuccessIconRing>
                    <SuccessIconWrap>
                      <Ionicons name="checkmark" size={28} color="#ffffff" />
                    </SuccessIconWrap>
                  </SuccessIconRing>
                  <SuccessTitle>
                    {t(
                      job.isReal
                        ? "jobDetailApplySuccessTitleReal"
                        : "jobDetailApplySuccessTitle",
                    )}
                  </SuccessTitle>
                  <SuccessSub>
                    {job.isReal
                      ? t("jobDetailApplySuccessSubtitleReal", {
                          company: job.company,
                        })
                      : t("jobDetailApplySuccessSubtitle")}
                  </SuccessSub>
                  <SuccessCloseButton onPress={() => setApplySheetOpen(false)}>
                    <SubmitButtonLabel>
                      {t("jobDetailApplyCloseButton")}
                    </SubmitButtonLabel>
                  </SuccessCloseButton>
                </SuccessWrap>
              )}
            </Sheet>
          </SheetBackdrop>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={cvSourceSheetOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCvSourceSheetOpen(false)}
      >
        <SheetBackdrop onPress={() => setCvSourceSheetOpen(false)}>
          <CvSourceSheet
            onStartShouldSetResponder={() => true}
            style={{ paddingBottom: insets.bottom + spacing.md }}
          >
            <SheetHandle />
            <SheetTitle>{t("jobDetailCvSourceSheetTitle")}</SheetTitle>
            <CvSourceOption onPress={scanCvWithCamera}>
              <CvSourceIconWrap>
                <Ionicons name="camera-outline" size={18} color={EMERALD} />
              </CvSourceIconWrap>
              <CvSourceTextCol>
                <CvSourceOptionLabel>
                  {t("jobDetailCvSourceScan")}
                </CvSourceOptionLabel>
                <CvSourceOptionSub>
                  {t("jobDetailCvSourceScanSub")}
                </CvSourceOptionSub>
              </CvSourceTextCol>
            </CvSourceOption>
            <CvSourceOption onPress={pickCvFromGallery}>
              <CvSourceIconWrap>
                <Ionicons name="images-outline" size={18} color={EMERALD} />
              </CvSourceIconWrap>
              <CvSourceTextCol>
                <CvSourceOptionLabel>
                  {t("jobDetailCvSourceGallery")}
                </CvSourceOptionLabel>
              </CvSourceTextCol>
            </CvSourceOption>
            <CvSourceOption onPress={pickCvFile}>
              <CvSourceIconWrap>
                <Ionicons
                  name="document-attach-outline"
                  size={18}
                  color={EMERALD}
                />
              </CvSourceIconWrap>
              <CvSourceTextCol>
                <CvSourceOptionLabel>
                  {t("jobDetailCvSourceFile")}
                </CvSourceOptionLabel>
              </CvSourceTextCol>
            </CvSourceOption>
          </CvSourceSheet>
        </SheetBackdrop>
      </Modal>
    </Container>
  );
}

const bodyContentStyle = { padding: spacing.lg, paddingBottom: spacing.xl };
const keyboardAvoidingStyle = { flex: 1 };

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(props) => props.theme.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  background-color: ${(props) => props.theme.surface};
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const IconButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
`;

const HeaderTitle = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
`;

const CircleIconButton = styled(Pressable)`
  width: 34px;
  height: 34px;
  border-radius: 17px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const Body = styled.ScrollView`
  flex: 1;
`;

const HeroRow = styled.View`
  flex-direction: row;
  gap: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const LogoGradient = styled(LinearGradient)`
  width: 64px;
  height: 64px;
  border-radius: ${radius.lg}px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const LogoLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 22px;
  color: #ffffff;
`;

const HeroInfo = styled.View`
  flex: 1;
  min-width: 0px;
  justify-content: center;
  gap: 4px;
`;

const HeroTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 20px;
  color: ${(props) => props.theme.text};
`;

const HeroCompanyRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const HeroCompanyText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
`;

const HeroMetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const HeroMetaText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const TagsRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

// The pill is a View wrapping a Text, not a styled Text on its own. As a
// bare Text it was a shrinkable flex item: once the four tags outgrew the
// row, React Native compressed them and wrapped the words *inside* each
// pill — "No experience" splitting across two lines within its own
// background — instead of moving whole pills onto the next row.
// `flex-shrink: 0` makes each pill atomic, so the row breaks between pills
// and every tag keeps its natural width on one line.
const Tag = styled.View`
  flex-shrink: 0;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) =>
    props.tint ??
    (props.accent ? "rgba(11, 110, 79, 0.1)" : props.theme.surfaceAlt)};
`;

// Carries the feed's green/amber/red onto the one tag it describes, rather
// than tinting the whole detail page. The list view answers "is this for
// me?" at a glance and needs the colour to be unmissable; here the job is
// already open and the reader wants the text, so the band shows up as a
// dot on the tag it belongs to and nothing else changes.
const ExperienceDot = styled.View`
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background-color: ${(props) => props.color};
`;

// Slightly heavier and tighter than the caption style it replaced — a tag
// is a label to be scanned, not prose, and the extra weight is what lets
// the two emerald tags read as the meaningful ones at a glance.
const TagLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 12px;
  color: ${(props) => props.color ?? (props.accent ? EMERALD : props.theme.textMuted)};
`;

const SalaryCard = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: rgba(11, 110, 79, 0.06);
  border-width: 1px;
  border-color: rgba(11, 110, 79, 0.16);
  margin-bottom: ${spacing.lg}px;
`;

const SalaryIconWrap = styled.View`
  width: 40px;
  height: 40px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.theme.surface};
  flex-shrink: 0;
`;

const SalaryLabel = styled.Text`
  font-size: 11px;
  font-weight: 700;
  color: ${(props) => props.theme.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 2px;
`;

const SalaryValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 17px;
  color: ${EMERALD};
`;

const SectionTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.sm}px;
`;

const FactsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.md}px;
  margin-bottom: ${spacing.lg}px;
`;

const FactItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  width: 47%;
`;

// The label/value column needs flex:1 and min-width:0 to actually claim the
// space left over beside the icon. Without them it was sized by its own
// content and then clipped by the 47% column, so a long value like "Sans
// expérience" wrapped onto a second line inside a row built for one.
const FactTextCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const FactIconWrap = styled.View`
  width: 34px;
  height: 34px;
  border-radius: ${radius.sm}px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.08);
  flex-shrink: 0;
`;

const FactLabel = styled.Text`
  font-size: 10.5px;
  color: ${(props) => props.theme.textMuted};
  font-weight: 600;
  margin-bottom: 1px;
`;

const FactValue = styled.Text`
  font-size: 13px;
  color: ${(props) => props.theme.text};
  font-weight: 600;
`;

const Paragraph = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
  line-height: 21px;
  margin-bottom: ${spacing.lg}px;
`;

const BulletList = styled.View`
  margin-bottom: ${spacing.lg}px;
`;

const BulletRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  margin-bottom: ${spacing.xs}px;
`;

const BulletDot = styled.View`
  width: 5px;
  height: 5px;
  border-radius: 2.5px;
  background-color: ${EMERALD};
  margin-top: 7px;
  flex-shrink: 0;
`;

const BulletText = styled.Text`
  flex: 1;
  ${type.body}
  color: ${(props) => props.theme.text};
  line-height: 20px;
`;

const CompanyCard = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surface};
  ${(props) => (props.theme.scheme === "dark" ? "" : "")}
  shadow-color: #000000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.06;
  shadow-radius: 8px;
  elevation: 2;
  margin-bottom: ${spacing.lg}px;
`;

const CompanyLogoGradient = styled(LinearGradient)`
  width: 52px;
  height: 52px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const CompanyLogoLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 16px;
  color: #ffffff;
`;

const CompanyInfoCol = styled.View`
  flex: 1;
  min-width: 0px;
`;

const CompanyNameRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 5px;
`;

const CompanyName = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const CompanySub = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 2px;
`;

const MapPreview = styled.View`
  height: 130px;
  border-radius: ${radius.lg}px;
  background-color: ${(props) => props.theme.surfaceAlt};
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.sm}px;
`;

const ApproxPill = styled.Text`
  position: absolute;
  top: ${spacing.sm}px;
  left: ${spacing.sm}px;
  right: ${spacing.sm}px;
  font-size: 10px;
  font-weight: 600;
  color: ${(props) => props.theme.textMuted};
  background-color: ${(props) => props.theme.surface}E6;
  padding: 4px 9px;
  border-radius: ${radius.pill}px;
  overflow: hidden;
`;

const DirectionsButton = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${spacing.xs}px;
  border-width: 1.5px;
  border-color: ${EMERALD};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px;
  margin-bottom: ${spacing.lg}px;
`;

const DirectionsButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const SafetyBox = styled.View`
  padding: ${spacing.md}px;
  border-radius: ${radius.md}px;
  background-color: rgba(11, 110, 79, 0.05);
  margin-bottom: ${spacing.md}px;
`;

const SafetyTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.xs}px;
`;

const SafetyTip = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  line-height: 18px;
`;

const ReportPressable = styled(Pressable)`
  align-self: center;
`;

const ReportRow = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

const CtaDock = styled.View`
  flex-direction: row;
  gap: ${spacing.sm}px;
  padding: ${spacing.sm}px ${spacing.lg}px 0;
  background-color: ${(props) => props.theme.background};
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const OwnerStatsDock = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.md}px;
  padding: ${spacing.md}px ${spacing.lg}px 0;
  background-color: ${(props) => props.theme.surface};
  border-top-width: 1px;
  border-top-color: ${(props) => props.theme.border};
`;

const OwnerStatItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
`;

const OwnerStatValue = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: ${(props) => props.theme.text};
`;

const OwnerStatLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const OwnerStatDivider = styled.View`
  width: 1px;
  height: 18px;
  background-color: ${(props) => props.theme.border};
`;

const ViewApplicationsButton = styled(Pressable)`
  flex: 1;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.sm}px;
  background-color: ${EMERALD};
`;

const ViewApplicationsButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: #ffffff;
`;

const ContactButton = styled(Pressable)`
  flex-basis: 128px;
  align-items: center;
  justify-content: center;
  border-width: 1.5px;
  border-color: ${EMERALD};
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.sm}px;
`;

const ContactButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const ApplyButton = styled(Pressable)`
  flex: 1;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  padding-vertical: ${spacing.sm}px;
  background-color: ${EMERALD};
`;

const ApplyButtonLabel = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 15px;
  color: #ffffff;
`;

const SheetBackdrop = styled(Pressable)`
  flex: 1;
  justify-content: flex-end;
  background-color: rgba(0, 0, 0, 0.4);
`;

const Sheet = styled.View`
  max-height: 88%;
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: ${spacing.sm}px ${spacing.lg}px 0;
`;

const SheetHandle = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${radius.pill}px;
  background-color: ${(props) => props.theme.border};
  align-self: center;
  margin-bottom: ${spacing.md}px;
`;

const SheetTitle = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15.5px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.md}px;
`;

// Lets the form scroll within the sheet's own bounded height once the
// keyboard is up — without this, the phone/message fields (and the submit
// button below them) end up hidden behind the keyboard with no way to
// reach them, since the sheet's max-height alone doesn't make its content
// reachable once the keyboard eats into the available space.
const ApplyFormScroll = styled.ScrollView``;

const CvRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px;
  border-radius: ${radius.md}px;
  border-width: 1.5px;
  border-style: dashed;
  border-color: rgba(11, 110, 79, 0.35);
  background-color: rgba(11, 110, 79, 0.05);
  margin-bottom: ${spacing.md}px;
`;

const CvRowLabel = styled.Text`
  flex: 1;
  font-family: ${fontFamily.semiBold};
  font-size: 13.5px;
  color: ${EMERALD};
`;

const CvSourceSheet = styled.View`
  background-color: ${(props) => props.theme.background};
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  padding: ${spacing.sm}px ${spacing.lg}px 0;
`;

const CvSourceOption = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding: ${spacing.md}px 0;
  border-bottom-width: 1px;
  border-bottom-color: ${(props) => props.theme.border};
`;

const CvSourceIconWrap = styled.View`
  width: 38px;
  height: 38px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.08);
  flex-shrink: 0;
`;

const CvSourceTextCol = styled.View`
  flex: 1;
`;

const CvSourceOptionLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 14.5px;
  color: ${(props) => props.theme.text};
`;

const CvSourceOptionSub = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  margin-top: 1px;
`;

const FieldGroup = styled.View`
  margin-bottom: ${spacing.md}px;
`;

const FieldLabel = styled.Text`
  font-size: 12.5px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
  margin-bottom: ${spacing.xs}px;
`;

const InputWrap = styled.View`
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.md}px;
  padding-horizontal: ${spacing.md}px;
  height: 48px;
  justify-content: center;
`;

const StyledInput = styled(TextInput)`
  ${type.body}
  color: ${(props) => props.theme.text};
`;

const TextareaWrap = styled.View`
  background-color: ${(props) => props.theme.surfaceAlt};
  border-radius: ${radius.md}px;
  padding: ${spacing.sm}px ${spacing.md}px;
  min-height: 84px;
`;

const StyledTextarea = styled(TextInput)`
  ${type.body}
  color: ${(props) => props.theme.text};
  text-align-vertical: top;
`;

const SubmitButton = styled(Pressable)`
  align-items: center;
  justify-content: center;
  border-radius: ${radius.md}px;
  padding-vertical: 14px;
  background-color: ${(props) => (props.disabled ? EMERALD + "59" : EMERALD)};
  margin-bottom: ${spacing.lg}px;
`;

// SubmitButton relies on its parent stretching it to full width by
// default — true inside the form (a plain View), but SuccessWrap
// deliberately centers its children (for the icon/title/subtitle above),
// which otherwise shrinks this same button down to hug its own label text
// instead of matching the form's full-width button.
const SuccessCloseButton = styled(SubmitButton)`
  align-self: stretch;
`;

const SubmitButtonLabel = styled.Text`
  font-family: ${fontFamily.semiBold};
  font-size: 15px;
  color: #ffffff;
`;

const SuccessWrap = styled.View`
  align-items: center;
  padding: ${spacing.lg}px ${spacing.sm}px ${spacing.sm}px;
`;

// A soft, light ring behind the solid checkmark badge — reads as a gentle
// "pulse" around the icon rather than a single flat circle, the same
// layered-badge treatment most success confirmations use.
const SuccessIconRing = styled.View`
  width: 92px;
  height: 92px;
  border-radius: 46px;
  align-items: center;
  justify-content: center;
  background-color: rgba(11, 110, 79, 0.08);
  margin-bottom: ${spacing.lg}px;
`;

const SuccessIconWrap = styled.View`
  width: 60px;
  height: 60px;
  border-radius: 30px;
  align-items: center;
  justify-content: center;
  background-color: ${EMERALD};
  shadow-color: ${EMERALD};
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 10px;
  elevation: 4;
`;

const SuccessTitle = styled.Text`
  font-family: ${fontFamily.bold};
  font-size: 19px;
  color: ${(props) => props.theme.text};
  text-align: center;
  margin-bottom: ${spacing.sm}px;
`;

const SuccessSub = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
  line-height: 21px;
  padding-horizontal: ${spacing.sm}px;
  margin-bottom: ${spacing.xl}px;
`;
