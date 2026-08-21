import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import styled from "styled-components/native";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { fontFamily } from "../theme/typography";

const TAB_ICONS = {
  Sell: "pricetag-outline",
  ForYou: "home-outline",
  Local: "location-outline",
  Notifications: "notifications-outline",
  Messages: "chatbubbles-outline",
};

// A floating, blurred pill tab bar (replacing the platform-default bar
// docked flush to the screen edge) — matches the onboarding/home mockup,
// which shows this same rounded, translucent bar on every tab screen.
export function FloatingTabBar({ state, descriptors, navigation }) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  // A screen can ask for the bar to go away with the standard
  // `tabBarStyle: { display: 'none' }`. A custom tabBar has to honour that
  // itself — the navigator only forwards the option, it cannot apply it.
  const focused = descriptors[state.routes[state.index].key];
  if (focused?.options?.tabBarStyle?.display === "none") return null;

  return (
    <Wrap style={{ paddingBottom: (insets.bottom || spacing.sm) + spacing.xs }}>
      <Bar intensity={40} tint={scheme === "dark" ? "dark" : "light"}>
        <BarTint surfaceColor={colors.surface} borderColor={colors.border}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label = options.title ?? route.name;
            const isFocused = state.index === index;
            const badge = options.tabBarBadge;

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem key={route.key} onPress={onPress} hitSlop={4}>
                <IconWrap active={isFocused}>
                  <Ionicons
                    name={TAB_ICONS[route.name]}
                    size={20}
                    color={isFocused ? colors.primary : colors.textMuted}
                  />
                  {badge ? (
                    <Badge color={colors.error}>
                      <BadgeLabel>{badge}</BadgeLabel>
                    </Badge>
                  ) : null}
                </IconWrap>
                <Label active={isFocused} color={isFocused ? colors.primary : colors.textMuted}>
                  {label}
                </Label>
              </TabItem>
            );
          })}
        </BarTint>
      </Bar>
    </Wrap>
  );
}

const Wrap = styled.View`
  padding-horizontal: 12px;
`;

const Bar = styled(BlurView)`
  border-radius: ${radius.xl + 4}px;
  overflow: hidden;
  shadow-color: #0b1f16;
  shadow-offset: 0px 6px;
  shadow-opacity: 0.16;
  shadow-radius: 16px;
  elevation: 10;
`;

const BarTint = styled.View`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  padding: 10px 8px;
  background-color: ${(props) => `${props.surfaceColor}CC`};
  border-width: 1px;
  border-color: ${(props) => props.borderColor};
`;

const TabItem = styled(Pressable)`
  align-items: center;
  gap: 3px;
  min-width: 52px;
`;

const IconWrap = styled(View)`
  width: 44px;
  height: 34px;
  border-radius: ${radius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => (props.active ? "rgba(11,110,79,0.1)" : "transparent")};
`;

const Label = styled.Text`
  font-size: 10.5px;
  font-family: ${(props) => (props.active ? fontFamily.semiBold : fontFamily.medium)};
  color: ${(props) => props.color};
`;

const Badge = styled.View`
  position: absolute;
  top: -2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  padding-horizontal: 3px;
  align-items: center;
  justify-content: center;
  background-color: ${(props) => props.color};
`;

const BadgeLabel = styled.Text`
  font-size: 10px;
  font-family: ${fontFamily.bold};
  color: #ffffff;
`;
