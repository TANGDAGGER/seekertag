import { Ionicons } from '@expo/vector-icons'
import { address } from '@solana/kit'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Field } from '@/components/field'
import { Screen } from '@/components/screen'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useItem, useTransferOwnership } from '@/features/items/item-hooks'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { shortenAddress } from '@/lib/format'
import { getDemoItem } from '@/mocks/demo-data'
import { authenticateWallet } from '@/lib/wallet-auth'
import { colors, radius, spacing } from '@/theme'

export default function TransferOwnershipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { account, signMessages } = useSeekerWallet()
  const isDemo = appConfig.demoMode && id?.startsWith('demo-')
  const itemQuery = useItem(isSupabaseConfigured && !isDemo ? id : undefined)
  const item = isDemo || !isSupabaseConfigured ? getDemoItem(id) : itemQuery.data
  const transfer = useTransferOwnership()
  const [recipient, setRecipient] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const review = () => {
    setError(null)
    try {
      address(recipient.trim())
      if (item && recipient.trim() === item.ownerWallet)
        throw new Error('Recipient must be different from the current owner.')
      setReviewing(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enter a valid Solana wallet address.')
    }
  }

  const confirmTransfer = async () => {
    setError(null)
    if (!item) return setError('This item could not be loaded.')
    if (isDemo || !isSupabaseConfigured)
      return setError('Configure Supabase and use a live item to transfer ownership.')
    if (!account || String(account.address) !== item.ownerWallet)
      return setError('Connect the current owner wallet to transfer this item.')
    const recipientWallet = recipient.trim()
    try {
      await authenticateWallet(String(account.address), signMessages)
      await transfer.mutateAsync({ itemId: item.id, recipientWallet })
      setComplete(true)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Ownership could not be transferred.'
      setError(
        message.toLowerCase().includes('recipient must connect')
          ? 'The recipient must connect that wallet to SeekerTag once before receiving this item.'
          : message,
      )
    }
  }

  if (complete && item) {
    return (
      <Screen title="Ownership transferred" subtitle={item.name}>
        <View style={styles.successState}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" color={colors.accentInk} size={42} />
          </View>
          <Text style={styles.successTitle}>Ownership transferred.</Text>
          <Text style={styles.successBody}>
            Ownership now belongs to {shortenAddress(recipient)}. The signed transfer remains in the item
            history.
          </Text>
          <AppButton label="Back to your items" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    )
  }

  if (!item) {
    return (
      <Screen back title="Transfer ownership">
        <View style={styles.successState}>
          <Text style={styles.successBody}>Loading item…</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen back title="Transfer ownership" subtitle={item.name}>
      <View style={styles.content}>
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Transfers change the verified owner.</Text>
          <Text style={styles.warningBody}>
            Check the recipient wallet carefully before signing. History remains append-only.
          </Text>
        </View>
        <Field
          label="Recipient wallet"
          placeholder="Enter a Solana address"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            setRecipient(value)
            setReviewing(false)
          }}
          value={recipient}
        />
        {reviewing ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Review transfer</Text>
            <Text style={styles.reviewLine}>Item · {item?.name}</Text>
            <Text style={styles.reviewLine}>From · {item ? shortenAddress(item.ownerWallet) : '—'}</Text>
            <Text style={styles.reviewLine}>To · {shortenAddress(recipient)}</Text>
            <Text style={styles.reviewLine}>Network · {appConfig.clusterName}</Text>
            <AppButton
              label="Sign & transfer"
              icon="finger-print-outline"
              loading={transfer.isPending}
              onPress={() => void confirmTransfer()}
            />
            <AppButton label="Cancel" variant="ghost" onPress={() => setReviewing(false)} />
          </View>
        ) : (
          <AppButton
            label="Review transfer"
            icon="arrow-forward-outline"
            disabled={!recipient.trim()}
            onPress={review}
          />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.phaseNote}>
          The recipient must connect this wallet to SeekerTag once before receiving the item.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.xl },
  warning: {
    backgroundColor: '#2F2919',
    borderColor: '#5B4D27',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningTitle: { color: colors.warning, fontSize: 15, fontWeight: '800' },
  warningBody: { color: '#CABD97', fontSize: 13, lineHeight: 19 },
  phaseNote: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  reviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  reviewTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  reviewLine: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
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
  successTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  successBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
})
