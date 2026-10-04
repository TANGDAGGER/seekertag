import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { StatusPill } from '@/components/status-pill'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useFinderReports, useItem } from '@/features/items/item-hooks'
import { formatDate, shortenAddress } from '@/lib/format'
import { getDemoItem } from '@/mocks/demo-data'
import { colors, radius, spacing } from '@/theme'

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const isDemo = appConfig.demoMode && id?.startsWith('demo-')
  const itemQuery = useItem(isSupabaseConfigured && !isDemo ? id : undefined)
  const reportsQuery = useFinderReports(isSupabaseConfigured && !isDemo ? id : undefined)
  const item = isDemo || !isSupabaseConfigured ? getDemoItem(id) : itemQuery.data

  if (itemQuery.isLoading) {
    return (
      <Screen back title="Item details">
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.stateText}>Loading item…</Text>
        </View>
      </Screen>
    )
  }

  if (itemQuery.isError || !item) {
    return (
      <Screen back title="Item details">
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" color={colors.danger} size={32} />
          <Text style={styles.stateText}>This item could not be found.</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen back title="Item details" subtitle={isDemo ? 'Demo data' : 'Verified SeekerTag item'}>
      <View style={styles.heroCard}>
        {item.imageUrl ? (
          <Image contentFit="cover" source={{ uri: item.imageUrl }} style={styles.itemImage} />
        ) : (
          <View style={styles.itemIcon}>
            <Ionicons name="headset-outline" size={44} color={colors.text} />
          </View>
        )}
        <StatusPill status={item.status} />
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>

      <View style={styles.verifiedCard}>
        <Ionicons name="shield-checkmark" size={25} color={colors.accent} />
        <View style={styles.verifiedText}>
          <Text style={styles.verifiedTitle}>Wallet-verified owner</Text>
          <Text style={styles.verifiedOwner}>Owner {shortenAddress(item.ownerWallet)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          icon="qr-code-outline"
          label="Show QR"
          onPress={() => router.push({ pathname: '/item/[id]/qr', params: { id: item.id } })}
        />
        <AppButton
          icon={item.status === 'lost' ? 'alert-circle' : 'alert-circle-outline'}
          label={item.status === 'lost' ? 'Lost mode active' : 'Mark as lost'}
          variant={item.status === 'lost' ? 'danger' : 'secondary'}
          onPress={() => router.push({ pathname: '/lost-mode/[id]', params: { id: item.id } })}
        />
        <AppButton
          icon="swap-horizontal-outline"
          label="Transfer ownership"
          variant="secondary"
          onPress={() => router.push({ pathname: '/transfer/[id]', params: { id: item.id } })}
        />
      </View>

      {item.status === 'lost' && (isDemo || (reportsQuery.data?.length ?? 0) > 0) ? (
        <View style={styles.foundSection}>
          <Text style={styles.sectionTitle}>Finder reports</Text>
          {(isDemo
            ? [{ id: 'demo-report', finderWallet: '72AbVzkZ1PU5RHBtExXk2Y8jVKbWdAFuURkNs5wDK91' }]
            : (reportsQuery.data ?? [])
          ).map((report) => (
            <View key={report.id} style={styles.foundCard}>
              <Ionicons name="hand-left-outline" color={colors.accent} size={24} />
              <View style={styles.foundText}>
                <Text style={styles.foundTitle}>Your item has been found.</Text>
                <Text style={styles.foundWallet}>Finder {shortenAddress(report.finderWallet)}</Text>
              </View>
              <AppButton
                label="View"
                variant="ghost"
                onPress={() => router.push({ pathname: '/finder-report/[id]', params: { id: report.id } })}
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.history}>
        <Text style={styles.sectionTitle}>Ownership history</Text>
        {item.ownershipHistory.map((event) => (
          <View key={event.id} style={styles.historyRow}>
            <View style={styles.timelineDot} />
            <View style={styles.historyText}>
              <Text style={styles.historyAction}>
                {event.action === 'claimed' ? 'Claimed by' : 'Transferred to'}{' '}
                {shortenAddress(event.toWallet)}
              </Text>
              <Text style={styles.historyDate}>{formatDate(event.createdAt)}</Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  heroCard: { alignItems: 'flex-start', gap: spacing.sm, paddingBottom: spacing.lg, paddingTop: spacing.lg },
  itemIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 88,
  },
  itemImage: { borderRadius: radius.lg, height: 140, marginBottom: spacing.sm, width: '100%' },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1, marginTop: spacing.sm },
  description: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  verifiedCard: {
    alignItems: 'center',
    backgroundColor: '#14281F',
    borderColor: '#24513A',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  verifiedText: { flex: 1 },
  verifiedTitle: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  verifiedOwner: { color: '#B8D8C4', fontSize: 12, marginTop: 3 },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  history: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  historyRow: { flexDirection: 'row', gap: spacing.md },
  timelineDot: { backgroundColor: colors.accent, borderRadius: 6, height: 9, marginTop: 5, width: 9 },
  historyText: { flex: 1 },
  historyAction: { color: colors.text, fontSize: 14, fontWeight: '600' },
  historyDate: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  foundSection: { gap: spacing.md, marginTop: spacing.xl },
  foundCard: {
    alignItems: 'center',
    backgroundColor: '#14281F',
    borderColor: '#24513A',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  foundText: { flex: 1 },
  foundTitle: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  foundWallet: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  centerState: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center' },
  stateText: { color: colors.textMuted, fontSize: 14 },
})
