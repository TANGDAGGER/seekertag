import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps, ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing } from '@/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

type AppButtonProps = {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  trailing?: ReactNode
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  trailing,
}: AppButtonProps) {
  const isDisabled = disabled || loading

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? colors.accentInk : colors.text} />
        ) : icon ? (
          <Ionicons
            name={icon}
            size={20}
            color={
              variant === 'primary' ? colors.accentInk : variant === 'danger' ? colors.danger : colors.text
            }
          />
        ) : null}
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      </View>
      {trailing}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#6B3035', borderWidth: 1 },
  ghost: { backgroundColor: 'transparent' },
  label: { fontSize: 16, fontWeight: '700' },
  primaryLabel: { color: colors.accentInk },
  secondaryLabel: { color: colors.text },
  dangerLabel: { color: colors.danger },
  ghostLabel: { color: colors.textMuted },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.48 },
})
