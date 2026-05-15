import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import type { WeatherCondition } from '@wi/core/weather';
import { getWeatherTheme } from '@wi/ui/themes';

export default function WeatherBackground({
  condition,
  children,
}: PropsWithChildren<{ condition: WeatherCondition }>) {
  const theme = getWeatherTheme(condition);
  // Accept any number of stops; pass the full gradient to LinearGradient.
  const colors = theme.gradient.length >= 2 ? theme.gradient : [theme.gradient[0] ?? '#fff', theme.gradient[0] ?? '#fff'];
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={colors as readonly [string, string, ...string[]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
