import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useBreakpoint } from '../../lib/breakpoints';
import { Loading } from '../../components/ui';
import { MinteaLockup } from '../../components/BrandMark';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName, focusedName: IconName) =>
  ({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) => (
    <Ionicons
      name={focused ? focusedName : name}
      size={size}
      color={color as string}
    />
  );

export default function TabsLayout() {
  const { session, isLoading } = useAuth();
  const { colors } = useTheme();
  const { isCompact } = useBreakpoint();

  if (isLoading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // A bottom bar is right on a phone and wrong on a desktop browser,
        // where navigation belongs at the side. React Navigation 7 can place
        // the same tab bar either way, so this is the whole responsive nav.
        tabBarPosition: isCompact ? 'bottom' : 'left',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // The sidebar's default active pill is iOS system blue. Left alone it
        // is the one un-branded element on the whole page.
        tabBarActiveBackgroundColor: isCompact ? undefined : colors.accentSoft,
        ...(!isCompact
          ? {
              tabBarBackground: () => (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { pointerEvents: 'none' },
                  ]}
                  className="bg-white dark:bg-ink-900"
                >
                  <View className="border-b border-ink-200 px-4 pb-4 pt-6 dark:border-ink-800">
                    <MinteaLockup compact />
                  </View>
                </View>
              ),
            }
          : {}),
        tabBarStyle: {
          // The desktop brand lives in `tabBarBackground`; keeping the tab
          // container opaque can cover that layer after a tab transition on
          // React Navigation web.
          backgroundColor: isCompact ? colors.surface : 'transparent',
          borderTopColor: colors.border,
          borderRightColor: colors.border,
          // minWidth as well as width: the sidebar sets its own minWidth from
          // a proportion of the window (25%), which silently beats `width`.
          ...(isCompact
            ? {
                minHeight: 68,
                paddingTop: 6,
                paddingBottom: 6,
              }
            : {
                width: 240,
                minWidth: 240,
                maxWidth: 240,
                paddingTop: 104,
                paddingHorizontal: 12,
              }),
        },
        tabBarLabelStyle: isCompact
          ? { fontSize: 11, fontWeight: '600' }
          : { fontSize: 15, fontWeight: '600' },
        tabBarItemStyle: isCompact
          ? { paddingTop: 4 }
          : { borderRadius: 12, marginBottom: 4, paddingVertical: 7 },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: icon('grid-outline', 'grid'),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Accounts',
          tabBarIcon: icon('wallet-outline', 'wallet'),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: icon('swap-horizontal-outline', 'swap-horizontal'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: icon('settings-outline', 'settings'),
        }}
      />
    </Tabs>
  );
}
