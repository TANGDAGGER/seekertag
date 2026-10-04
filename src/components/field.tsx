import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native'
import { colors, radius, spacing } from '@/theme'

type FieldProps = TextInputProps & { label: string; hint?: string }

export function Field({ label, hint, multiline, style, ...props }: FieldProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  multiline: { minHeight: 112, textAlignVertical: 'top' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
})
