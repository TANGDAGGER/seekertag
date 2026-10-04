import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Field } from '@/components/field'
import { Screen } from '@/components/screen'
import { appConfig } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useItem, useMarkItemLost } from '@/features/items/item-hooks'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { getDemoItem } from '@/mocks/demo-data'
import { parseTokenAmount } from '@/lib/token-amount'
import { authenticateWallet } from '@/lib/wallet-auth'
import { colors, radius, spacing } from '@/theme'

export default function LostModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { account, signMessages } = useSeekerWallet()
  const isDemo = appConfig.demoMode && id?.startsWith('demo-')
  const itemQuery = useItem(isSupabaseConfigured && !isDemo ? id : undefined)
  const item = isDemo || !isSupabaseConfigured ? getDemoItem(id) : itemQuery.data
  const markLost = useMarkItemLost()
  const [rewardAmount, setRewardAmount] = useState('100')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!item) return setError('This item could not be loaded.')
    if (isDemo || !isSupabaseConfigured)
      return setError('Configure Supabase and register a live item to activate Lost Mode.')
    if (!account || String(account.address) !== item.ownerWallet)
      return setError('Connect the current owner wallet to change this item.')
    try {
      if (!appConfig.rewardToken) throw new Error('A reward token is not configured.')
      parseTokenAmount(rewardAmount, appConfig.rewardToken.decimals)
      await authenticateWallet(String(account.address), signMessages)
      await markLost.mutateAsync({ itemId: item.id, rewardAmount })
      router.back()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lost Mode could not be activated.')
    }
  }

  return (
    <Screen back title="Lost Mode" subtitle={item?.name ?? 'Item'}>
      <View style={styles.content}>
        <View style={styles.alertIcon}>
          <Ionicons name="alert-circle" color={colors.danger} size={42} />
        </View>
        <View>
          <Text style={styles.title}>Help this item find its way home.</Text>
          <Text style={styles.body}>
            Anyone who scans its tag will see that it is lost and the reward you offer.
          </Text>
        </View>
        <Field
          keyboardType="decimal-pad"
          label="Finder reward"
          onChangeText={setRewardAmount}
          value={rewardAmount}
          hint={`${appConfig.rewardToken?.symbol ?? 'Demo reward'} is not escrowed. You send it only after the item is physically returned.`}
        />
        <View style={styles.rewardPreview}>
          <Text style={styles.rewardLabel}>PUBLIC REWARD</Text>
          <Text style={styles.rewardValue}>
            {rewardAmount || '0'} {appConfig.rewardToken?.symbol ?? 'DEMO'}
          </Text>
        </View>
        <AppButton
          icon="alert-circle-outline"
          label="Activate Lost Mode"
          loading={markLost.isPending}
          onPress={submit}
          variant="danger"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.xl },
  alertIcon: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    height: 82,
    justifyContent: 'center',
    width: 82,
  },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8, lineHeight: 34 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  rewardPreview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  rewardLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  rewardValue: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
