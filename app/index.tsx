import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { StatusPill } from '@/components/status-pill'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useItems } from '@/features/items/item-hooks'
import { WalletCard } from '@/features/wallet/wallet-card'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { demoItems } from '@/mocks/demo-data'
import { colors, radius, spacing } from '@/theme'

export default function HomeScreen() {
  const { account } = useSeekerWallet()
  const router = useRouter()
  const walletAddress = account ? String(account.address) : undefined
  const liveMode = !appConfig.demoMode && isSupabaseConfigured
  const itemsQuery = useItems(liveMode ? walletAddress : undefined)
  const items = appConfig.demoMode ? demoItems : (itemsQuery.data ?? [])

  return (
    <Screen subtitle="Proof of ownership, in your pocket.">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>OWNERSHIP, MADE VISIBLE</Text>
        <Text style={styles.title}>Protect what you own.</Text>
        <Text style={styles.lede}>
          Tag an item, verify its owner, and reward the person who brings it home.
        </Text>
      </View>

      <WalletCard />

      {account ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Your items</Text>
              <Text style={styles.demoLabel}>
                {appConfig.demoMode
                  ? 'DEMO MODE · local sample data'
                  : isSupabaseConfigured
                    ? 'Synced with Supabase'
                    : 'Setup error · Supabase is required'}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Scan a tag"
              onPress={() => router.push('/scan')}
              style={styles.scanButton}
            >
              <Ionicons name="scan-outline" color={colors.text} size={21} />
            </Pressable>
          </View>

          {itemsQuery.isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.stateText}>Loading your items…</Text>
            </View>
          ) : itemsQuery.isError ? (
            <View style={styles.stateCard}>
              <Ionicons name="cloud-offline-outline" color={colors.danger} size={24} />
              <Text style={styles.stateText}>Your items could not be loaded.</Text>
              <AppButton label="Try again" variant="secondary" onPress={() => void itemsQuery.refetch()} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.stateCard}>
              <Ionicons name="pricetag-outline" color={colors.accent} size={25} />
              <Text style={styles.emptyTitle}>Nothing tagged yet</Text>
              <Text style={styles.stateText}>Add the first item you want to protect.</Text>
            </View>
          ) : (
            <View style={styles.itemList}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                  style={({ pressed }) => [styles.itemCard, pressed && styles.pressed]}
                >
                  <View style={styles.itemIcon}>
                    <Ionicons
                      name={item.id.includes('airpods') ? 'headset-outline' : 'bag-handle-outline'}
                      color={colors.text}
                      size={25}
                    />
                  </View>
                  <View style={styles.itemText}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemHint}>Tap to view ownership</Text>
                  </View>
                  <StatusPill status={item.status} />
                </Pressable>
              ))}
            </View>
          )}

          <AppButton icon="add" label="Add item" onPress={() => router.push('/add-item')} />
          {__DEV__ ? (
            <AppButton
              icon="pulse-outline"
              label="Pre-demo health"
              variant="ghost"
              onPress={() => router.push('/health')}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.promiseRow}>
          <Promise icon="shield-checkmark-outline" label="Verified owner" />
          <Promise icon="qr-code-outline" label="Scannable tag" />
          <Promise icon="return-down-back-outline" label="Reward returns" />
        </View>
      )}
    </Screen>
  )
}

function Promise({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.promise}>
      <Ionicons name={icon} color={colors.accent} size={22} />
      <Text style={styles.promiseText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingBottom: spacing.xl, paddingTop: spacing.xl },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: {
    color: colors.text,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.8,
    lineHeight: 46,
    marginTop: 10,
  },
  lede: { color: colors.textMuted, fontSize: 16, lineHeight: 24, marginTop: spacing.md, maxWidth: 340 },
  section: { gap: spacing.md, marginTop: spacing.xl },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  demoLabel: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  scanButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  itemList: { gap: spacing.sm },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  stateText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  itemCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  pressed: { opacity: 0.76 },
  itemIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  itemText: { flex: 1 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  itemHint: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
  promiseRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  promise: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    minHeight: 96,
    justifyContent: 'center',
    padding: spacing.sm,
  },
  promiseText: { color: colors.textMuted, fontSize: 11, lineHeight: 15, textAlign: 'center' },
})
