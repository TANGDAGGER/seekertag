import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { appConfig, getExplorerTransactionUrl } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useFinderReport, useItem } from '@/features/items/item-hooks'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { shortenAddress } from '@/lib/format'
import {
  beginReward,
  cancelRewardAttempt,
  confirmAndFinalizeReward,
  recordRewardSubmission,
} from '@/lib/item-service'
import {
  confirmRewardTransaction,
  getRewardTransferErrorMessage,
  prepareRewardTransfer,
} from '@/lib/skr-transfer'
import { authenticateWallet } from '@/lib/wallet-auth'
import { DEMO_FINDER, getDemoItem } from '@/mocks/demo-data'
import { colors, radius, spacing } from '@/theme'

export default function FinderReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { account, getTransactionSigner, sendTransactions, signMessages } = useSeekerWallet()
  const [reviewing, setReviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [pendingSignature, setPendingSignature] = useState<string | null>(null)
  const [rewardAttemptId, setRewardAttemptId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)
  const isDemo = appConfig.demoMode && id === 'demo-report'
  const reportQuery = useFinderReport(isSupabaseConfigured && !isDemo ? id : undefined)
  const report = isDemo
    ? {
        id,
        itemId: 'demo-backpack',
        finderWallet: DEMO_FINDER,
        status: 'open' as const,
        rewardState: 'none' as const,
        createdAt: new Date().toISOString(),
      }
    : reportQuery.data
  const itemQuery = useItem(isSupabaseConfigured && report?.itemId && !isDemo ? report.itemId : undefined)
  const item = isDemo ? getDemoItem('demo-backpack') : itemQuery.data

  if (reportQuery.isLoading || itemQuery.isLoading) {
    return (
      <Screen back title="Finder report">
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    )
  }

  if (!report || !item) {
    return (
      <Screen back title="Finder report">
        <View style={styles.centerState}>
          <Text style={styles.body}>This finder report could not be loaded.</Text>
        </View>
      </Screen>
    )
  }

  const rewardAmount = item.finderRewardAmount ?? '0'
  const rewardToken = appConfig.rewardToken
  const rewardSymbol = rewardToken?.symbol ?? 'DEMO'
  const mintLabel = rewardToken ? shortenAddress(String(rewardToken.mint)) : 'Not configured'

  const sendReward = async () => {
    setError(null)
    setSending(true)
    let currentAttemptId: string | null = null
    let submittedSignature: string | null = null
    try {
      if (isDemo || !isSupabaseConfigured)
        throw new Error('A live Supabase finder report is required to send a reward.')
      if (!account || String(account.address) !== item.ownerWallet)
        throw new Error('Connect the current owner wallet to send this reward.')
      await authenticateWallet(String(account.address), signMessages)
      currentAttemptId = await beginReward(report.id)
      setRewardAttemptId(currentAttemptId)
      const signer = getTransactionSigner(account.address, 0n)
      const prepared = await prepareRewardTransfer({
        ownerWallet: item.ownerWallet,
        finderWallet: report.finderWallet,
        rewardAmount,
        signer,
      })
      const transactionSignature = await sendTransactions(prepared.instructions)
      submittedSignature = transactionSignature
      setPendingSignature(transactionSignature)
      await recordRewardSubmission(report.id, currentAttemptId, transactionSignature)
      await confirmRewardTransaction(transactionSignature)
      await confirmAndFinalizeReward(report.id, transactionSignature)
      setSignature(transactionSignature)
      setPendingSignature(null)
    } catch (cause) {
      if (currentAttemptId && !submittedSignature) {
        await cancelRewardAttempt(report.id, currentAttemptId).catch(() => undefined)
      }
      if (submittedSignature) {
        setSyncWarning(
          'A transaction signature exists, so SeekerTag will not send again. Use Reconcile submitted reward after checking the transaction.',
        )
      }
      setError(getRewardTransferErrorMessage(cause))
    } finally {
      setSending(false)
    }
  }

  const reconcileReward = async () => {
    const submittedSignature = pendingSignature ?? report.rewardTransactionSignature
    const attemptId = rewardAttemptId ?? report.rewardAttemptId
    if (!submittedSignature) return setError('No submitted transaction signature is available to reconcile.')
    setSending(true)
    setError(null)
    try {
      if (!account || String(account.address) !== item.ownerWallet)
        throw new Error('Connect the current owner wallet to reconcile this reward.')
      await authenticateWallet(String(account.address), signMessages)
      if (report.rewardState === 'submitting') {
        if (!attemptId) throw new Error('The pending reward attempt is missing its recovery ID.')
        await recordRewardSubmission(report.id, attemptId, submittedSignature)
      }
      await confirmRewardTransaction(submittedSignature)
      await confirmAndFinalizeReward(report.id, submittedSignature)
      setSignature(submittedSignature)
      setPendingSignature(null)
      setSyncWarning(null)
    } catch (cause) {
      setError(getRewardTransferErrorMessage(cause))
    } finally {
      setSending(false)
    }
  }

  const completedSignature = signature ?? item.rewardTransactionSignature

  if (completedSignature) {
    return (
      <Screen title="Return complete" subtitle={item.name}>
        <View style={styles.successState}>
          <View style={styles.returnIcon}>
            <Ionicons name="checkmark" color={colors.accentInk} size={44} />
          </View>
          <View style={styles.checkList}>
            <SuccessLine label="ITEM RETURNED" />
            <SuccessLine label={`${rewardSymbol} REWARDED`} />
            <SuccessLine label="TRANSACTION VERIFIED ON SOLANA" />
          </View>
          <View style={styles.signatureCard}>
            <Text style={styles.messageLabel}>TRANSACTION SIGNATURE</Text>
            <Text selectable style={styles.signatureText}>
              {completedSignature}
            </Text>
          </View>
          {syncWarning ? <Text style={styles.syncWarning}>{syncWarning}</Text> : null}
          <AppButton
            icon="open-outline"
            label="View in Solana Explorer"
            onPress={() => void Linking.openURL(getExplorerTransactionUrl(completedSignature))}
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen back title="Finder report" subtitle="Return and reward preview">
      <View style={styles.content}>
        <View style={styles.successIcon}>
          <Ionicons name="hand-left-outline" color={colors.accent} size={42} />
        </View>
        <Text style={styles.title}>Your {item.name} has been found.</Text>
        <Text style={styles.body}>A finder used its SeekerTag and connected a wallet.</Text>

        <View style={styles.reportCard}>
          <Fact label="Finder" value={shortenAddress(report.finderWallet)} />
          <View style={styles.divider} />
          <Fact label="Reward" value={`${rewardAmount} ${rewardSymbol}`} />
          <View style={styles.divider} />
          <Fact label="Status" value="Awaiting return" />
        </View>

        {'message' in report && report.message ? (
          <View style={styles.messageCard}>
            <Text style={styles.messageLabel}>FINDER MESSAGE</Text>
            <Text style={styles.messageText}>{report.message}</Text>
          </View>
        ) : null}

        {reviewing ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Review before signing</Text>
            <Fact label="Send" value={`${rewardAmount} ${rewardSymbol}`} />
            <Fact label="To" value={shortenAddress(report.finderWallet)} />
            <Fact label="Network" value={appConfig.clusterName} />
            <Fact label="Mint" value={mintLabel} />
            <Text style={styles.reviewHint}>
              Your wallet will show the final transaction. The finder token account may be created if it does
              not exist.
            </Text>
            <AppButton
              icon="wallet-outline"
              label="Open wallet & send"
              disabled={Boolean(
                pendingSignature || report.rewardTransactionSignature || report.rewardState !== 'none',
              )}
              loading={sending}
              onPress={() => void sendReward()}
            />
            <AppButton label="Cancel" variant="ghost" onPress={() => setReviewing(false)} />
          </View>
        ) : (
          <AppButton
            icon="gift-outline"
            label="Reward finder"
            disabled={report.rewardState !== 'none'}
            onPress={() => setReviewing(true)}
          />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {pendingSignature ? (
          <>
            <AppButton
              icon="sync-outline"
              label="Reconcile submitted reward"
              loading={sending}
              variant="secondary"
              onPress={() => void reconcileReward()}
            />
            <AppButton
              icon="open-outline"
              label="Check submitted transaction"
              variant="ghost"
              onPress={() => void Linking.openURL(getExplorerTransactionUrl(pendingSignature))}
            />
          </>
        ) : null}
        {!pendingSignature && report.rewardTransactionSignature && report.rewardState !== 'confirmed' ? (
          <AppButton
            icon="sync-outline"
            label="Reconcile submitted reward"
            loading={sending}
            variant="secondary"
            onPress={() => void reconcileReward()}
          />
        ) : null}
        {report.rewardState === 'submitting' && !pendingSignature && !report.rewardTransactionSignature ? (
          <Text style={styles.syncWarning}>
            This reward is locked after an interrupted attempt. Do not send again until an operator confirms
            no transaction was submitted, then resets this attempt in Supabase.
          </Text>
        ) : null}
        <Text style={styles.disclaimer}>
          You will always review the wallet, amount, token, and network before signing.
        </Text>
      </View>
    </Screen>
  )
}

function SuccessLine({ label }: { label: string }) {
  return (
    <View style={styles.successLine}>
      <Ionicons name="checkmark-circle" color={colors.accent} size={22} />
      <Text style={styles.successLabel}>{label}</Text>
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.xl },
  successIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#183126',
    borderRadius: radius.lg,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 35,
    textAlign: 'center',
  },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  reportCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  factLabel: { color: colors.textMuted, fontSize: 13 },
  factValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  divider: { backgroundColor: colors.border, height: 1 },
  disclaimer: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  messageCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  messageLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  messageText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  reviewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  reviewTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.xs },
  reviewHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginVertical: spacing.sm },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  successState: { flex: 1, gap: spacing.lg, justifyContent: 'center' },
  returnIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  checkList: { alignSelf: 'center', gap: spacing.sm },
  successLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  successLabel: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 0.7 },
  signatureCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  signatureText: { color: colors.text, fontSize: 11, lineHeight: 17 },
  syncWarning: { color: colors.warning, fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
