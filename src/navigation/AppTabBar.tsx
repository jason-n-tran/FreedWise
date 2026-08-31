// Custom flat tab bar. Mono labels under a hard ink rule; the active tab carries
// the marker swipe (the signature), and the Review tab shows the due count as a
// small marker chip rather than the stock red dot.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { type, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import { useAppStore } from '../store/appStore';

export default function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const dueCount = useAppStore(s => s.dueCount);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name;
        const focused = state.index === index;
        const showBadge = route.name === 'Review' && dueCount > 0;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            onPress={onPress}
            style={styles.tab}
            hitSlop={6}
          >
            <View style={styles.labelWrap}>
              {focused ? <View style={styles.swipe} pointerEvents="none" /> : null}
              <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {abbreviate(label)}
              </Text>
              {showBadge ? (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>{dueCount > 99 ? '99+' : dueCount}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// Mono labels read best short and uppercased.
function abbreviate(label: string): string {
  return label.toUpperCase();
}
