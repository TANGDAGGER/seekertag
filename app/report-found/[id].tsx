import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Field } from '@/components/field'
import { Screen } from '@/components/screen'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useCreateFinderReport, useItem } from '@/features/items/item-hooks'
import { WalletCard } from '@/features/wallet/wallet-card'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { getDemoItem } from '@/mocks/demo-data'
import { authenticateWallet } from '@/lib/wallet-auth'
import { colors, radius, spacing } from '@/theme'

export default function ReportFoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { account, signMessages } = useSeekerWallet()
  const isDemo = appConfig.demoMode && id?.startsWith('demo-')
  const itemQuery = useItem(isSupabaseConfigured && !isDemo ? id : undefined)
  const item = isDemo ? getDemoItem(id) : itemQuery.data
  const createReport = useCreateFinderReport()
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const submit = async () => {
    setError(null)
    if (!account) return setError('Connect a wallet so the owner knows where to send the reward.')
    if (!item) return setError('This item could not be loaded.')
    if (isDemo || !isSupabaseConfigured)
      return setError('This is demo data. Scan a live item after Supabase is configured.')
    const finderWallet = String(account.address)
    if (finderWallet === item.ownerWallet)
      return setError('The owner wallet cannot create a finder report for its own item.')
    try {
      await authenticateWallet(finderWallet, signMessages)
      await createReport.mutateAsync({ itemId: item.id, finderWallet, message })
      setSubmitted(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The finder report could not be sent.')
    }
  }

  if (submitted) {
    return (
      <Screen title="Report sent">
        <View style={styles.successState}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" color={colors.accentInk} size={42} />
          </View>
          <Text style={styles.title}>The owner has been notified.</Text>
          <Text style={styles.body}>
            Keep the item safe. Arrange the physical return outside SeekerTag, then the owner can send the
            reward-token reward.
          </Text>
          <AppButton label="Done" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    )
  }

  return (
    <Screen back title="I found this" subtitle={item?.name ?? 'Lost item'}>
      <View style={styles.content}>
        <View style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>FINDER REWARD</Text>
          <Text style={styles.rewardValue}>
            {item?.finderRewardAmount ?? '—'} {appConfig.rewardToken?.symbol ?? 'DEMO'}
          </Text>
          <Text style={styles.rewardHint}>Paid by the owner after the physical item is returned.</Text>
        </View>
        <WalletCard compact />
        <Field
          label="Message (optional)"
          multiline
          maxLength={500}
          onChangeText={setMessage}
          placeholder="I found it near the café entrance."
          value={message}
        />
        <AppButton
          icon="paper-plane-outline"
          label="Send finder report"
          loading={createReport.isPending}
          onPress={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.privacy}>
          Your connected public wallet address is shared with the owner. No private key or seed phrase is
          requested.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.xl },
  rewardCard: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: '#6B3035',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  rewardLabel: { color: colors.danger, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  rewardValue: { color: colors.text, fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  rewardHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  privacy: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  successState: { flex: 1, gap: spacing.lg, justifyContent: 'center' },
  successIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 82,
    justifyContent: 'center',
    width: 82,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 35,
    textAlign: 'center',
  },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
})
