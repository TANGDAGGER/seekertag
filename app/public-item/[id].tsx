import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useItem } from '@/features/items/item-hooks'
import { WalletCard } from '@/features/wallet/wallet-card'
import { shortenAddress } from '@/lib/format'
import { getDemoItem } from '@/mocks/demo-data'
import { colors, radius, spacing } from '@/theme'

export default function PublicItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const isDemo = appConfig.demoMode && id?.startsWith('demo-')
  const itemQuery = useItem(isSupabaseConfigured && !isDemo ? id : undefined)
  const item = isDemo ? getDemoItem(id) : itemQuery.data

  if (itemQuery.isLoading) {
    return (
      <Screen back title="SeekerTag" subtitle="Public item profile">
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>Verifying tag…</Text>
        </View>
      </Screen>
    )
  }

  if (!isSupabaseConfigured && !isDemo) {
    return (
      <Screen back title="SeekerTag" subtitle="Configuration required">
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" color={colors.warning} size={34} />
          <Text style={styles.stateTitle}>Public lookup is not configured.</Text>
          <Text style={styles.stateText}>
            Add the Supabase environment values and restart the development build.
          </Text>
        </View>
      </Screen>
    )
  }

  if (itemQuery.isError || !item) {
    return (
      <Screen back title="SeekerTag" subtitle="Public item profile">
        <View style={styles.centerState}>
          <Ionicons name="help-circle-outline" color={colors.danger} size={36} />
          <Text style={styles.stateTitle}>Item not found</Text>
          <Text style={styles.stateText}>This code is valid, but no SeekerTag item exists for it.</Text>
          <AppButton label="Scan another tag" variant="secondary" onPress={() => router.replace('/scan')} />
        </View>
      </Screen>
    )
  }
  const isLost = item.status === 'lost'

  return (
    <Screen back title="SeekerTag" subtitle="Public item profile">
      <View style={styles.content}>
        <View style={[styles.itemIcon, isLost && styles.lostIcon]}>
          <Ionicons name="bag-handle-outline" size={48} color={isLost ? colors.danger : colors.text} />
        </View>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={[styles.statusCard, isLost ? styles.lostCard : styles.safeCard]}>
          <Ionicons
            name={isLost ? 'alert-circle' : 'shield-checkmark'}
            color={isLost ? colors.danger : colors.accent}
            size={25}
          />
          <View>
            <Text style={[styles.statusTitle, { color: isLost ? colors.danger : colors.accent }]}>
              {isLost ? 'LOST' : 'WALLET-VERIFIED OWNER'}
            </Text>
            <Text style={styles.statusBody}>
              {isLost ? 'The owner is looking for this item.' : 'This item has a verified SeekerTag owner.'}
            </Text>
          </View>
        </View>

        <View style={styles.factGrid}>
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Owner</Text>
            <Text style={styles.factValue}>{shortenAddress(item.ownerWallet)}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Finder reward</Text>
            <Text style={styles.factValue}>
              {isLost ? `${item.finderRewardAmount} ${appConfig.rewardToken?.symbol ?? 'DEMO'}` : '—'}
            </Text>
          </View>
        </View>

        {isLost ? (
          <>
            <WalletCard compact />
            <AppButton
              icon="hand-right-outline"
              label="I found this"
              onPress={() => router.push({ pathname: '/report-found/[id]', params: { id: item.id } })}
            />
          </>
        ) : (
          <View style={styles.protectedNote}>
            <Ionicons name="checkmark-circle-outline" color={colors.accent} size={20} />
            <Text style={styles.protectedText}>No action is needed. This item is marked as protected.</Text>
          </View>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.xl },
  itemIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  lostIcon: { backgroundColor: colors.dangerSoft },
  itemName: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, textAlign: 'center' },
  statusCard: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  lostCard: { backgroundColor: colors.dangerSoft, borderColor: '#6B3035' },
  safeCard: { backgroundColor: '#14281F', borderColor: '#24513A' },
  statusTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 0.9 },
  statusBody: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  factGrid: { flexDirection: 'row', gap: spacing.sm },
  fact: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  factLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' },
  factValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  protectedNote: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  protectedText: { color: colors.textMuted, flex: 1, fontSize: 13, lineHeight: 19 },
  centerState: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center' },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '800', textAlign: 'center' },
  stateText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
})
