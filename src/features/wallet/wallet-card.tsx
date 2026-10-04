import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { appConfig } from '@/config/app-config'
import type { WalletAuthenticationStage } from '@/features/wallet/wallet-auth-flow'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { shortenAddress } from '@/lib/format'
import { colors, radius, spacing } from '@/theme'

export function WalletCard({ compact = false }: { compact?: boolean }) {
  const {
    connectedAccount,
    verified,
    status,
    authStage,
    error,
    authenticationDiagnostic,
    walletSession,
    openWalletChooser,
    disconnect,
    changeWallet,
    retryVerification,
  } = useSeekerWallet()
  const connecting = status === 'connecting' || status === 'verifying'
  const disconnecting = status === 'disconnecting'
  const progressLabel = getAuthenticationProgressLabel(authStage)

  if (connectedAccount) {
    const address = String(connectedAccount.address)
    const accountLabel = walletSession?.accountLabel ?? connectedAccount.label
    return (
      <View style={[styles.connectedCard, compact && styles.compact]}>
        <View style={styles.walletIdentity}>
          <View style={styles.walletIcon}>
            {walletSession?.walletIcon ? (
              <Image source={{ uri: walletSession.walletIcon }} style={styles.returnedWalletIcon} />
            ) : (
              <Ionicons name="wallet-outline" size={20} color={colors.accent} />
            )}
          </View>
          <View style={styles.walletText}>
            <Text style={styles.eyebrow}>Connection</Text>
            <Text style={styles.identityValue}>Mobile Wallet Adapter</Text>
          </View>
          <View style={styles.networkBadge}>
            <Text style={styles.networkText}>
              {verified ? 'verified' : connecting ? 'verifying' : appConfig.clusterName}
            </Text>
          </View>
        </View>
        <View style={styles.identityDetails}>
          <IdentityLine label="Wallet" value="Selected by Android" />
          {accountLabel ? <IdentityLine label="Account" value={accountLabel} /> : null}
          <View style={styles.identityLine}>
            <Text style={styles.identityLabel}>Address</Text>
            <Text selectable style={styles.address}>
              {compact ? shortenAddress(address, 5, 5) : address}
            </Text>
          </View>
        </View>
        {connecting ? (
          <Text accessibilityLiveRegion="polite" style={styles.progress}>
            {progressLabel}
          </Text>
        ) : null}
        {!compact ? (
          <View style={styles.actions}>
            <AppButton
              label="Change wallet"
              variant="secondary"
              loading={disconnecting}
              onPress={() => void changeWallet().catch(() => undefined)}
            />
            <AppButton
              label="Disconnect"
              variant="ghost"
              loading={disconnecting}
              onPress={() => void disconnect().catch(() => undefined)}
            />
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {authenticationDiagnostic ? <WalletDiagnosticBlock diagnostic={authenticationDiagnostic} /> : null}
        {!appConfig.demoMode && !verified && !connecting && !disconnecting ? (
          <AppButton label="Verify wallet" variant="secondary" onPress={() => void retryVerification()} />
        ) : null}
      </View>
    )
  }

  return (
    <View style={styles.disconnectedCard}>
      <Text style={styles.connectionTitle}>Your wallet is your identity.</Text>
      <Text style={styles.connectionBody}>
        Connect through Android Mobile Wallet Adapter. SeekerTag never sees or stores your private keys.
      </Text>
      <AppButton
        icon="wallet-outline"
        label={connecting ? progressLabel : appConfig.demoMode ? 'Connect wallet' : 'Connect & verify wallet'}
        loading={connecting}
        onPress={openWalletChooser}
      />
      <Text style={styles.networkLine}>Android selects the compatible wallet · {appConfig.clusterName}</Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {authenticationDiagnostic ? <WalletDiagnosticBlock diagnostic={authenticationDiagnostic} /> : null}
    </View>
  )
}

function getAuthenticationProgressLabel(stage: WalletAuthenticationStage | null): string {
  switch (stage) {
    case 'preflight_session':
      return 'Preparing app session…'
    case 'challenge_request_pre_wallet':
      return 'Preparing secure challenge…'
    case 'siws_sign_in':
    case 'sign_messages_fallback':
      return 'Waiting for signature…'
    case 'signature_extract':
    case 'server_verify':
    case 'server_binding':
    case 'session_persist':
      return 'Verifying wallet…'
    default:
      return 'Connecting wallet…'
  }
}

function WalletDiagnosticBlock({
  diagnostic,
}: {
  diagnostic: NonNullable<ReturnType<typeof useSeekerWallet>['authenticationDiagnostic']>
}) {
  const [expanded, setExpanded] = useState(false)
  const yesNo = (value: boolean) => (value ? 'yes' : 'no')

  return (
    <View style={styles.diagnosticBlock}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.diagnosticToggle}
      >
        <Text style={styles.diagnosticTitle}>Authentication diagnostics</Text>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.diagnosticDetails}>
          <DiagnosticLine label="Stage" value={diagnostic.stage} />
          <DiagnosticLine
            label="MWA error code"
            value={diagnostic.mwaErrorCode === undefined ? 'not available' : String(diagnostic.mwaErrorCode)}
          />
          <DiagnosticLine label="MWA error class" value={diagnostic.mwaErrorClass} />
          <DiagnosticLine label="wallet_uri_base returned" value={yesNo(diagnostic.walletUriBaseReturned)} />
          <DiagnosticLine
            label="Authorized account obtained"
            value={yesNo(diagnostic.authorizedAccountObtained)}
          />
          <DiagnosticLine label="Challenge obtained" value={yesNo(diagnostic.challengeObtained)} />
          <DiagnosticLine label="Signed payload received" value={yesNo(diagnostic.signedPayloadReceived)} />
          <DiagnosticLine
            label="Server verification reached"
            value={yesNo(diagnostic.serverVerificationReached)}
          />
          <DiagnosticLine label="Cluster" value={diagnostic.cluster} />
        </View>
      ) : null}
    </View>
  )
}

function DiagnosticLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.diagnosticLine}>
      <Text style={styles.diagnosticLabel}>{label}:</Text>
      <Text selectable style={styles.diagnosticValue}>
        {value}
      </Text>
    </View>
  )
}

function IdentityLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.identityLine}>
      <Text style={styles.identityLabel}>{label}</Text>
      <Text style={styles.identityValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  disconnectedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  connectedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  actions: { gap: spacing.xs },
  compact: { padding: spacing.sm },
  walletIdentity: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  walletIcon: {
    alignItems: 'center',
    backgroundColor: '#183126',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  walletText: { flex: 1 },
  eyebrow: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' },
  identityDetails: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  identityLine: { gap: 2 },
  identityLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  identityValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  address: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  returnedWalletIcon: { borderRadius: 8, height: 28, width: 28 },
  networkBadge: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  networkText: { color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  connectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  connectionBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  networkLine: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  progress: { color: colors.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  diagnosticBlock: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  diagnosticToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  diagnosticTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  diagnosticDetails: { gap: 5, paddingTop: spacing.sm },
  diagnosticLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  diagnosticLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  diagnosticValue: { color: colors.text, fontSize: 11 },
})
