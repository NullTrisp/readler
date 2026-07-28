import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme, type TextProps, type ViewStyle } from 'react-native';

export const palette = {
  green50: '#E8F5E9', green100: '#C8E6C9', green300: '#81C784', green600: '#43A047',
  green700: '#388E3C', green800: '#2E7D32', green900: '#1B5E20',
  primary: '#2E7D32', primaryPressed: '#1B5E20', primaryLight: '#81C784',
  ink: '#172019', muted: '#536158', paper: '#F7FBF7', dark: '#07130C', darkCard: '#0E1C13',
  border: '#C5D0C6', danger: '#BA1A1A', success: '#2E7D32',
};

export const readlerThemes = {
  light: {
    primary: palette.green800,
    primaryPressed: palette.green900,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.green100,
    onPrimaryContainer: palette.green900,
    background: palette.paper,
    surface: '#FFFFFF',
    surfaceVariant: '#E8F0E9',
    onSurface: palette.ink,
    onSurfaceVariant: palette.muted,
    outline: '#77847A',
    outlineVariant: palette.border,
    danger: '#BA1A1A',
    dangerPressed: '#93000A',
    onDanger: '#FFFFFF',
    disabledContainer: '#E0E0E0',
    onDisabled: '#616161',
  },
  dark: {
    primary: palette.green300,
    primaryPressed: '#A5D6A7',
    onPrimary: '#0B3A16',
    primaryContainer: palette.green900,
    onPrimaryContainer: palette.green100,
    background: palette.dark,
    surface: palette.darkCard,
    surfaceVariant: '#1B2A20',
    onSurface: '#E3EAE4',
    onSurfaceVariant: '#BAC8BD',
    outline: '#87958A',
    outlineVariant: '#3E4D42',
    danger: '#FFB4AB',
    dangerPressed: '#FFDAD6',
    onDanger: '#690005',
    disabledContainer: '#424242',
    onDisabled: '#BDBDBD',
  },
} as const;

export function useReadlerTheme() {
  return useColorScheme() === 'dark' ? readlerThemes.dark : readlerThemes.light;
}

export function Screen({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const colors = useReadlerTheme();
  return <View style={[styles.screen, { backgroundColor: colors.background }, style]}>{children}</View>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const colors = useReadlerTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }, style]}>{children}</View>;
}

export function AppText({ children, muted, title, style, ...props }: TextProps & { muted?: boolean; title?: boolean }) {
  const colors = useReadlerTheme();
  return <Text {...props} style={[styles.text, { color: muted ? colors.onSurfaceVariant : colors.onSurface }, title && styles.title, style]}>{children}</Text>;
}

export function Button({ children, onPress, secondary, danger, disabled, icon }: PropsWithChildren<{
  onPress(): void; secondary?: boolean; danger?: boolean; disabled?: boolean; icon?: ReactNode;
}>) {
  const colors = useReadlerTheme();
  const backgroundColor = disabled ? colors.disabledContainer : danger ? colors.danger : secondary ? colors.primaryContainer : colors.primary;
  const pressedBackgroundColor = danger ? colors.dangerPressed : secondary ? colors.primaryContainer : colors.primaryPressed;
  const textColor = disabled ? colors.onDisabled : danger ? colors.onDanger : secondary ? colors.onPrimaryContainer : colors.onPrimary;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={({ pressed }) => [
    styles.button,
    { backgroundColor },
    pressed && !disabled && { backgroundColor: pressedBackgroundColor, transform: [{ scale: 0.995 }] },
  ]}>{icon}<Text style={[styles.buttonText, { color: textColor }]}>{children}</Text></Pressable>;
}

export function Loading() {
  const colors = useReadlerTheme();
  return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const colors = useReadlerTheme();
  return <View style={styles.empty}><Text style={[styles.emptyIcon, { color: colors.primary }]}>◫</Text><AppText title>{title}</AppText><AppText muted style={{ textAlign: 'center' }}>{body}</AppText>{action}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16 },
  text: { fontSize: 15, lineHeight: 21 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  button: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon: { fontSize: 52 },
});
