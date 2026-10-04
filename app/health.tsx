import { Camera } from 'expo-camera'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { appConfig, verifyConfiguredRpc } from '@/config/app-config'
import { isSupabaseConfigured } from '@/config/supabase'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { ensureAppSession } from '@/lib/auth-session'
import { getWalletAuthStatus } from '@/lib/wallet-auth'
import { colors, radius, spacing } from '@/theme'

type HealthState = {
  supabase: boolean
  rpc: boolean
  camera: boolean
  walletVerified: boolean
  error?: string
}

export default function HealthScreen() {
  const { account } = useSeekerWallet()
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthState>({
    supabase: false,
    rpc: false,
    camera: false,
    walletVerified: false,
  })

  const runChecks = async () => {
    setLoading(true)
    const next: HealthState = { supabase: false, rpc: false, camera: false, walletVerified: false }
    const errors: string[] = []
    try {
      if (isSupabaseConfigured) {
        await ensureAppSession()
        next.supabase = true
        const status = await getWalletAuthStatus()
        next.walletVerified = Boolean(account && status?.walletAddress === String(account.address))
      }
    } catch (cause) {
      errors.push(`Supabase: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    try {
      await verifyConfiguredRpc()
      next.rpc = true
    } catch (cause) {
      errors.push(`Solana: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    try {
      next.camera = (await Camera.getCameraPermissionsAsync()).granted
    } catch (cause) {
      errors.push(`Camera: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
    next.error = errors.join('\n') || undefined
    setHealth(next)
    setLoading(false)
  }

  useEffect(() => {
    void runChecks()
    // This screen is a manual development diagnostic; rerun with the button after state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!__DEV__) {
    return (
      <Screen back title="Pre-demo health">
        <Text style={styles.note}>Diagnostics are available only in development builds.</Text>
      </Screen>
    )
  }

  return (
    <Screen back title="Pre-demo health" subtitle="No secrets are displayed">
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        <HealthRow
          label="Supabase"
          value={health.supabase ? '✓ reachable' : '✗ unavailable'}
          ok={health.supabase}
        />
        <HealthRow label="Solana RPC" value={health.rpc ? '✓ correct network' : '✗ failed'} ok={health.rpc} />
        <HealthRow label="Cluster" value={appConfig.clusterName} ok={health.rpc} />
        <HealthRow
          label="Reward token"
          value={appConfig.rewardToken ? `${appConfig.rewardToken.symbol} · configured` : 'missing'}
          ok={Boolean(appConfig.rewardToken)}
        />
        <HealthRow
          label="Wallet"
          value={
            !account
              ? 'disconnected'
              : health.walletVerified
                ? 'connected · verified'
                : 'connected · not verified'
          }
          ok={health.walletVerified}
        />
        <HealthRow
          label="Camera permission"
          value={health.camera ? 'granted' : 'missing'}
          ok={health.camera}
        />
        <HealthRow label="DEMO MODE" value={appConfig.demoMode ? 'ON' : 'OFF'} ok={!appConfig.demoMode} />
        {health.error ? <Text style={styles.error}>{health.error}</Text> : null}
        <AppButton label="Run checks again" variant="secondary" onPress={() => void runChecks()} />
      </View>
    </Screen>
  )
}

function HealthRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: ok ? colors.accent : colors.warning }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.xl },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  value: { fontSize: 13, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  note: { color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
})
