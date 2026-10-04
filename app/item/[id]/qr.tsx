import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Screen } from '@/components/screen'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useItem } from '@/features/items/item-hooks'
import { createItemQrValue } from '@/lib/qr'
import { getDemoItem } from '@/mocks/demo-data'
import { colors, radius, spacing } from '@/theme'

export default function ItemQrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const isDemo = appConfig.demoMode && id?.startsWith('demo-')
  const itemQuery = useItem(isSupabaseConfigured && !isDemo ? id : undefined)
  const item = isDemo || !isSupabaseConfigured ? getDemoItem(id) : itemQuery.data
  const qrValue = item ? createItemQrValue(id, appConfig.demoMode) : ''

  return (
    <Screen back title="Item QR" subtitle="Let another device scan this tag.">
      <View style={styles.content}>
        <Text style={styles.itemName}>{item?.name ?? 'SeekerTag item'}</Text>
        <View style={styles.qrPlaceholder}>
          {qrValue ? (
            <QRCode backgroundColor={colors.white} color="#15171B" size={216} value={qrValue} />
          ) : (
            <Text style={styles.phaseNote}>Item not found</Text>
          )}
        </View>
        <View style={styles.notice}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.accent} />
          <Text style={styles.noticeText}>
            The tag contains only a SeekerTag item identifier—never private wallet data.
          </Text>
        </View>
        <Text selectable style={styles.phaseNote}>
          Item ID · {id}
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xl },
  itemName: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7 },
  qrPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    height: 272,
    justifyContent: 'center',
    padding: spacing.lg,
    width: 272,
  },
  notice: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: { color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 19 },
  phaseNote: { color: colors.textMuted, fontSize: 12 },
})
