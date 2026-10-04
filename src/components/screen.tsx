import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import type { PropsWithChildren } from 'react'
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BrandMark } from '@/components/brand-mark'
import { appConfig } from '@/config/app-config'
import { colors, spacing } from '@/theme'

type ScreenProps = PropsWithChildren<{
  title?: string
  subtitle?: string
  back?: boolean
  scroll?: boolean
}>

export function Screen({ children, title, subtitle, back, scroll = true }: ScreenProps) {
  const router = useRouter()
  const body = <View style={styles.body}>{children}</View>

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        {back ? (
          <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-back" size={23} color={colors.text} />
          </Pressable>
        ) : (
          <BrandMark />
        )}
        <View style={styles.headerText}>
          <Text style={styles.brand}>{title ?? 'SeekerTag'}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {appConfig.demoMode ? (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>DEMO MODE · LOCAL DATA · NO BLOCKCHAIN SUCCESS IS SIMULATED</Text>
        </View>
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
  },
  headerText: { flex: 1 },
  brand: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  scrollContent: { flexGrow: 1 },
  body: { flex: 1, paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg },
  demoBanner: { backgroundColor: '#4A3516', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  demoText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
})
