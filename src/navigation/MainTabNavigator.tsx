// Main Tab Navigator.
//
// NOTE: tab screens are imported EAGERLY. We previously wrapped each non-Library
// screen in React.lazy + Suspense (a startup-perf optimization, Req 11.1), but
// React.lazy nested inside react-native-screens' react-freeze Suspender crashed
// on tab switch ("Cannot read property 'replace' of undefined" thrown at the
// Lazy/Suspense boundary). The four screens are small, so eager import is the
// correct tradeoff and removes the crash.

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from './types';
import AppTabBar from './AppTabBar';

import LibraryScreen from '../screens/LibraryScreen';
import HighlightsScreen from '../screens/HighlightsScreen';
import ReviewScreen from '../screens/ReviewScreen';
import SearchScreen from '../screens/SearchScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  // The due-review count badge lives in the custom tab bar (AppTabBar), which
  // reads dueCount from the shared store directly. (Gap 2 read site)
  return (
    <Tab.Navigator
      tabBar={props => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Library" component={LibraryScreen} options={{ tabBarLabel: 'Library' }} />
      <Tab.Screen
        name="Highlights"
        component={HighlightsScreen}
        options={{ tabBarLabel: 'Highlights' }}
      />
      <Tab.Screen name="Review" component={ReviewScreen} options={{ tabBarLabel: 'Review' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarLabel: 'Search' }} />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
