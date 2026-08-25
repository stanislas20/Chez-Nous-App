import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, shadow, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { type } from "../theme/typography";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";
import { useMyListings } from "../hooks/useMyListings";
import { openListing } from "../utils/openListing";

const WEEKS_TO_SHOW = 8;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FALLBACK_TIP_KEYS = [
  "insightsTipGoodPhotos",
  "insightsTipCompetitivePricing",
  "insightsTipRespondQuickly",
];

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date) {
  const result = new Date(date);
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function getMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function SellerInsightsScreen({ navigation }) {
  const { colors } = useTheme();
  const { language, t } = useI18n();
  const { user } = useAuth();
  const listings = useMyListings(user?.uid);

  const today = useMemo(() => new Date(), []);
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(today));

  const eventsByDay = useMemo(() => {
    const map = new Map();
    (listings ?? []).forEach((item) => {
      const createdDate = item.createdAt?.toDate?.();
      if (createdDate) {
        const key = toDateKey(createdDate);
        const entry = map.get(key) ?? { posted: [], sold: [] };
        entry.posted.push(item);
        map.set(key, entry);
      }
      if (item.saleStatus === "sold") {
        const soldDate = item.soldAt?.toDate?.();
        if (soldDate) {
          const key = toDateKey(soldDate);
          const entry = map.get(key) ?? { posted: [], sold: [] };
          entry.sold.push(item);
          map.set(key, entry);
        }
      }
    });
    return map;
  }, [listings]);

  const weeklySoldCounts = useMemo(() => {
    const currentWeekStart = startOfWeek(today);
    const weeks = [];
    for (let i = WEEKS_TO_SHOW - 1; i >= 0; i -= 1) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = (listings ?? []).filter((item) => {
        if (item.saleStatus !== "sold") return false;
        const soldDate = item.soldAt?.toDate?.();
        return soldDate && soldDate >= weekStart && soldDate < weekEnd;
      }).length;
      weeks.push({ weekStart, count });
    }
    return weeks;
  }, [listings, today]);

  const trend = useMemo(() => {
    const last = weeklySoldCounts[weeklySoldCounts.length - 1]?.count ?? 0;
    const prev = weeklySoldCounts[weeklySoldCounts.length - 2]?.count ?? 0;
    if (prev === 0 && last === 0) return { direction: "flat", percent: 0 };
    if (prev === 0) return { direction: "up", percent: 100 };
    const percent = Math.round(((last - prev) / prev) * 100);
    if (percent > 0) return { direction: "up", percent };
    if (percent < 0) return { direction: "down", percent: Math.abs(percent) };
    return { direction: "flat", percent: 0 };
  }, [weeklySoldCounts]);

  const tips = useMemo(() => {
    const items = listings ?? [];
    const now = Date.now();
    const result = [];

    const lowPhotoListing = items.find(
      (item) =>
        item.saleStatus !== "sold" &&
        (item.media?.length ?? (item.mediaUrl ? 1 : 0)) <= 1,
    );
    if (lowPhotoListing) {
      const title =
        language === "en" ? lowPhotoListing.titleEn : lowPhotoListing.titleFr;
      result.push({ key: "insightsTipMorePhotos", params: { title } });
    }

    const staleListing = items.find((item) => {
      if (item.saleStatus === "sold" || item.status !== "approved")
        return false;
      const createdDate = item.createdAt?.toDate?.();
      return createdDate && now - createdDate.getTime() > FOURTEEN_DAYS_MS;
    });
    if (staleListing) {
      const title =
        language === "en" ? staleListing.titleEn : staleListing.titleFr;
      result.push({ key: "insightsTipStaleListing", params: { title } });
    }

    const postedRecently = items.some((item) => {
      const createdDate = item.createdAt?.toDate?.();
      return createdDate && now - createdDate.getTime() < SEVEN_DAYS_MS;
    });
    if (!postedRecently) {
      result.push({ key: "insightsTipPostRegularly", params: {} });
    }

    let fallbackIndex = 0;
    while (result.length < 3 && fallbackIndex < FALLBACK_TIP_KEYS.length) {
      result.push({ key: FALLBACK_TIP_KEYS[fallbackIndex], params: {} });
      fallbackIndex += 1;
    }

    return result;
  }, [listings, language]);

  const monthGrid = useMemo(
    () => getMonthGrid(monthCursor.getFullYear(), monthCursor.getMonth()),
    [monthCursor],
  );
  const monthLabel = capitalize(
    monthCursor.toLocaleDateString(language === "en" ? "en-US" : "fr-FR", {
      month: "long",
      year: "numeric",
    }),
  );
  const weekdayLabels =
    language === "en"
      ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
      : ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

  const selectedEvents = eventsByDay.get(selectedDate) ?? {
    posted: [],
    sold: [],
  };
  const agendaItems = [
    ...selectedEvents.posted.map((item) => ({ item, kind: "posted" })),
    ...selectedEvents.sold.map((item) => ({ item, kind: "sold" })),
  ];

  const maxWeekCount = Math.max(
    1,
    ...weeklySoldCounts.map((week) => week.count),
  );
  const shortDateFormatter = new Intl.DateTimeFormat(
    language === "en" ? "en-US" : "fr-FR",
    {
      day: "numeric",
      month: "short",
    },
  );

  const goToListing = (item) => {
    openListing(navigation, item, t, language);
  };

  return (
    <Container edges={["left", "right", "bottom"]}>
      <Content>
        <Card>
          <CalendarHeader>
            <Pressable
              onPress={() => setMonthCursor((prev) => addMonths(prev, -1))}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <CalendarMonthLabel>{monthLabel}</CalendarMonthLabel>
            <Pressable
              onPress={() => setMonthCursor((prev) => addMonths(prev, 1))}
              hitSlop={8}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.primary}
              />
            </Pressable>
          </CalendarHeader>

          <WeekdayRow>
            {weekdayLabels.map((label, index) => (
              <WeekdayLabel key={`${label}-${index}`}>{label}</WeekdayLabel>
            ))}
          </WeekdayRow>

          <DayGrid>
            {monthGrid.map((date, index) => {
              if (!date) {
                return <DayCell key={index} as={View} />;
              }
              const key = toDateKey(date);
              const events = eventsByDay.get(key);
              const isSelected = key === selectedDate;
              return (
                <DayCell
                  key={index}
                  onPress={() => setSelectedDate(key)}
                  selected={isSelected}
                >
                  <DayNumber selected={isSelected}>{date.getDate()}</DayNumber>
                  <DotRow>
                    {events?.posted.length ? (
                      <Dot color={colors.primary} />
                    ) : null}
                    {events?.sold.length ? <Dot color={colors.error} /> : null}
                  </DotRow>
                </DayCell>
              );
            })}
          </DayGrid>

          <LegendRow>
            <LegendItem>
              <Dot color={colors.primary} />
              <LegendLabel>{t("insightsCalendarPostedLabel")}</LegendLabel>
            </LegendItem>
            <LegendItem>
              <Dot color={colors.error} />
              <LegendLabel>{t("insightsCalendarSoldLabel")}</LegendLabel>
            </LegendItem>
          </LegendRow>

          <Divider />

          {agendaItems.length === 0 ? (
            <EmptyAgendaText>{t("insightsCalendarEmptyDay")}</EmptyAgendaText>
          ) : (
            agendaItems.map(({ item, kind }) => (
              <AgendaRow
                key={`${kind}-${item.id}`}
                onPress={() => goToListing(item)}
              >
                <AgendaThumb
                  source={{ uri: item.mediaUrl ?? item.image }}
                  resizeMode="cover"
                />
                <AgendaBody>
                  <AgendaTitle numberOfLines={1}>
                    {language === "en" ? item.titleEn : item.titleFr}
                  </AgendaTitle>
                  <AgendaTag sold={kind === "sold"}>
                    <AgendaTagLabel sold={kind === "sold"}>
                      {kind === "sold"
                        ? t("insightsCalendarSoldLabel")
                        : t("insightsCalendarPostedLabel")}
                    </AgendaTagLabel>
                  </AgendaTag>
                </AgendaBody>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </AgendaRow>
            ))
          )}
        </Card>

        <Card>
          <TrendBanner direction={trend.direction}>
            <Ionicons
              name={
                trend.direction === "up"
                  ? "trending-up"
                  : trend.direction === "down"
                    ? "trending-down"
                    : "remove-outline"
              }
              size={18}
              color={
                trend.direction === "up"
                  ? colors.primary
                  : trend.direction === "down"
                    ? colors.error
                    : colors.textMuted
              }
            />
            <TrendLabel direction={trend.direction}>
              {trend.direction === "up"
                ? t("insightsTrendUp", { percent: trend.percent })
                : trend.direction === "down"
                  ? t("insightsTrendDown", { percent: trend.percent })
                  : t("insightsTrendFlat")}
            </TrendLabel>
          </TrendBanner>

          <SectionSubtitle>{t("insightsGraphTitle")}</SectionSubtitle>
          <GraphRow>
            {weeklySoldCounts.map((week, index) => (
              <BarColumn key={index}>
                <BarCount>{week.count}</BarCount>
                <BarTrack>
                  <Bar
                    style={{
                      height: `${Math.max(6, (week.count / maxWeekCount) * 100)}%`,
                    }}
                  />
                </BarTrack>
                <BarLabel>{shortDateFormatter.format(week.weekStart)}</BarLabel>
              </BarColumn>
            ))}
          </GraphRow>
        </Card>

        <Card>
          <SectionSubtitle>{t("insightsTipsTitle")}</SectionSubtitle>
          {tips.map((tip, index) => (
            <TipRow key={index} last={index === tips.length - 1}>
              <Ionicons
                name="bulb-outline"
                size={18}
                color={colors.accentDark}
              />
              <TipText>{t(tip.key, tip.params)}</TipText>
            </TipRow>
          ))}
        </Card>
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

const Card = styled.View`
  background-color: ${(props) => props.theme.surface};
  border-radius: ${radius.lg}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  ${shadow.card}
`;

const CalendarHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const CalendarMonthLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const WeekdayRow = styled.View`
  flex-direction: row;
`;

const WeekdayLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  width: ${100 / 7}%;
  text-align: center;
`;

const DayGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`;

const DayCell = styled(Pressable)`
  width: ${100 / 7}%;
  aspect-ratio: 1;
  align-items: center;
  justify-content: center;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => (props.selected ? props.theme.primary : "transparent")};
`;

const DayNumber = styled.Text`
  ${type.caption}
  color: ${(props) => (props.selected ? props.theme.textInverse : props.theme.text)};
`;

const DotRow = styled.View`
  flex-direction: row;
  gap: 3px;
  height: 6px;
  margin-top: 2px;
`;

const Dot = styled.View`
  width: 5px;
  height: 5px;
  border-radius: 2.5px;
  background-color: ${(props) => props.color};
`;

const LegendRow = styled.View`
  flex-direction: row;
  gap: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
`;

const LegendItem = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
`;

const LegendLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
`;

const Divider = styled.View`
  height: 1px;
  background-color: ${(props) => props.theme.border};
  margin-vertical: ${spacing.md}px;
`;

const EmptyAgendaText = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  text-align: center;
`;

const AgendaRow = styled(Pressable)`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.sm}px;
  padding-vertical: ${spacing.xs}px;
`;

const AgendaThumb = styled.Image`
  width: 40px;
  height: 40px;
  border-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.surfaceAlt};
`;

const AgendaBody = styled.View`
  flex: 1;
  gap: 2px;
`;

const AgendaTitle = styled.Text`
  ${type.bodyMedium}
  color: ${(props) => props.theme.text};
`;

const AgendaTag = styled.View`
  align-self: flex-start;
  background-color: ${(props) => (props.sold ? props.theme.errorLight : props.theme.primaryLight)};
  border-radius: ${radius.pill}px;
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 1px;
`;

const AgendaTagLabel = styled.Text`
  ${type.captionMedium}
  font-size: 11px;
  color: ${(props) => (props.sold ? props.theme.error : props.theme.primaryDark)};
`;

const TrendBanner = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${spacing.xs}px;
  margin-bottom: ${spacing.md}px;
`;

const TrendLabel = styled.Text`
  ${type.bodyMedium}
  color: ${(props) =>
    props.direction === "up"
      ? props.theme.primary
      : props.direction === "down"
        ? props.theme.error
        : props.theme.textMuted};
`;

const SectionSubtitle = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.textMuted};
  margin-bottom: ${spacing.sm}px;
`;

const GraphRow = styled.View`
  flex-direction: row;
  align-items: flex-end;
  height: 120px;
  gap: ${spacing.xs}px;
`;

const BarColumn = styled.View`
  flex: 1;
  height: 100%;
  align-items: center;
  justify-content: flex-end;
`;

const BarCount = styled.Text`
  ${type.captionMedium}
  color: ${(props) => props.theme.text};
  font-size: 11px;
  margin-bottom: 2px;
`;

const BarTrack = styled.View`
  width: 100%;
  flex: 1;
  justify-content: flex-end;
  align-items: center;
`;

const Bar = styled.View`
  width: 60%;
  max-width: 22px;
  min-height: 4px;
  border-top-left-radius: ${radius.sm}px;
  border-top-right-radius: ${radius.sm}px;
  background-color: ${(props) => props.theme.primary};
`;

const BarLabel = styled.Text`
  ${type.caption}
  color: ${(props) => props.theme.textMuted};
  font-size: 10px;
  margin-top: 4px;
`;

const TipRow = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${spacing.sm}px;
  padding-vertical: ${spacing.sm}px;
  border-bottom-width: ${(props) => (props.last ? "0px" : "1px")};
  border-bottom-color: ${(props) => props.theme.border};
`;

const TipText = styled.Text`
  ${type.body}
  color: ${(props) => props.theme.text};
  flex: 1;
`;
