import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Trophy, User, ClipboardList } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeScreen } from '../screens/home/HomeScreen';
import { TestsScreen } from '../screens/tests/TestsScreen';
import { LeaderboardScreen } from '../screens/leaderboard/LeaderboardScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { MainTabParamList } from './types';
import { colors, radius } from '../theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function AppTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 4);
  const tabBarHeight = 60 + bottomInset;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: Math.max(bottomInset - 1, 6),
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceRaised,
          borderRadius: 0,
          elevation: 8,
          shadowColor: colors.shadow,
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: -4 },
          shadowRadius: 8,
        },
        tabBarItemStyle: {
          paddingTop: 0,
          paddingBottom: 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 2,
        },
        tabBarIcon: ({ color, focused }) => {
          const wrappedIcon = (icon: React.ReactNode) => (
            <View style={styles.iconWrap}>
              {focused ? <View style={styles.activeIndicator} /> : null}
              {icon}
            </View>
          );

          if (route.name === 'Home') {
            return wrappedIcon(<Home size={22} color={color} strokeWidth={2.1} />);
          }

          if (route.name === 'Tests') {
            return wrappedIcon(<ClipboardList size={21} color={color} strokeWidth={2.05} />);
          }

          if (route.name === 'Leaderboard') {
            return wrappedIcon(<Trophy size={21} color={color} strokeWidth={2.05} />);
          }

          return wrappedIcon(<User size={21} color={color} strokeWidth={2.05} />);
        },
      })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Tests" component={TestsScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  activeIndicator: {
    position: 'absolute',
    top: -7,
    width: 28,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
});
