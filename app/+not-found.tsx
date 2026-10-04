import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { colors, spacing } from '@/theme'

export default function NotFoundScreen() {
  const router = useRouter()
  return (
    <Screen title="Not found">
      <View style={styles.content}>
        <Text style={styles.title}>This tag does not exist.</Text>
        <Text style={styles.body}>
          The QR may be invalid, damaged, or no longer connected to a SeekerTag item.
        </Text>
        <AppButton label="Back to home" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.lg, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 31, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
})
