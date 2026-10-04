import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { useEffect, useState } from 'react'
import { Linking, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { PHANTOM_NATIVE_SUPPORTED } from '@/features/wallet/wallet-session'
import { colors, radius, spacing } from '@/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

type WalletExample = {
  id: string
  name: string
  detail: string
  icon: IconName
  helpUrl?: string
}

const MWA_WALLET_EXAMPLES: WalletExample[] = [
  {
    id: 'seed-vault',
    name: 'Seeker / Seed Vault Wallet',
    detail: 'Built-in wallet · MWA compatible',
    icon: 'hardware-chip-outline',
  },
  {
    id: 'solflare',
    name: 'Solflare',
    detail: 'MWA compatible example',
    icon: 'sunny-outline',
    helpUrl: 'https://www.solflare.com/download/',
  },
  {
    id: 'backpack',
    name: 'Backpack',
    detail: 'MWA compatible example',
    icon: 'bag-handle-outline',
    helpUrl: 'https://support.backpack.exchange/start-here/downloads',
  },
  {
    id: 'jupiter',
    name: 'Jupiter Mobile',
    detail: 'MWA compatible example',
    icon: 'planet-outline',
    helpUrl: 'https://app.jupiter.money/',
  },
  {
    id: 'espresso',
    name: 'Espresso Cash',
    detail: 'MWA compatible example',
    icon: 'cafe-outline',
    helpUrl: 'https://www.espressocash.com/docs/about-espresso-cash/how-can-i-download/',
  },
  {
    id: 'other',
    name: 'Other compatible wallets',
    detail: 'Any wallet registered as an Android MWA handler',
    icon: 'wallet-outline',
    helpUrl: 'https://wallets.solanamobile.com/',
  },
]

type WalletPickerProps = {
  visible: boolean
  busy: boolean
  notice?: string | null
  onClose: () => void
  onConnectMwa: () => void
}

export function WalletPicker({ visible, busy, notice, onClose, onConnectMwa }: WalletPickerProps) {
  const [showPhantom, setShowPhantom] = useState(false)
  const [helpError, setHelpError] = useState(false)

  useEffect(() => {
    if (!visible) {
      setShowPhantom(false)
      setHelpError(false)
    }
  }, [visible])

  const openHelp = (url: string) => {
    setHelpError(false)
    void Linking.openURL(url).catch(() => setHelpError(true))
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close wallet chooser" onPress={onClose} style={styles.backdrop} />
        <SafeAreaView style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{showPhantom ? 'About Phantom' : 'Choose Wallet'}</Text>
              <Text style={styles.subtitle}>
                {showPhantom
                  ? 'Phantom mobile uses a different native dApp connection model.'
                  : 'SeekerTag connects through Solana Mobile Wallet Adapter on devnet.'}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" color={colors.text} size={22} />
            </Pressable>
          </View>

          {showPhantom ? (
            <ScrollView contentContainerStyle={styles.phantomContent}>
              <View style={styles.notice}>
                <Ionicons name="shield-checkmark-outline" color={colors.warning} size={24} />
                <Text style={styles.noticeTitle}>Not available for native SeekerTag connection yet</Text>
                <Text style={styles.noticeBody}>
                  SeekerTag does not use undocumented deep links or claim native Phantom support that has not
                  passed the required physical authorization, message-signing, and transaction tests.
                </Text>
              </View>
              <AppButton
                icon="wallet-outline"
                label="Back to MWA wallets"
                onPress={() => setShowPhantom(false)}
              />
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {notice ? <Text style={styles.sessionNotice}>{notice}</Text> : null}
              <View style={styles.primaryCard}>
                <AppButton
                  icon="wallet-outline"
                  label="Connect & verify wallet"
                  loading={busy}
                  onPress={onConnectMwa}
                />
                <Text style={styles.primaryCopy}>
                  Android will open a compatible Mobile Wallet Adapter wallet and request a secure sign-in
                  signature in the same connection.
                </Text>
                <Text style={styles.defaultCopy}>
                  If Android keeps opening the same wallet, it may be your default MWA handler. SeekerTag
                  cannot change Android wallet defaults.
                </Text>
              </View>

              <Text style={styles.sectionLabel}>MWA-COMPATIBLE WALLET EXAMPLES</Text>
              {MWA_WALLET_EXAMPLES.map((wallet) => (
                <View key={wallet.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <View style={styles.icon}>
                      <Ionicons name={wallet.icon} color={colors.accent} size={22} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.walletName}>{wallet.name}</Text>
                      <Text style={styles.walletDetail}>{wallet.detail}</Text>
                    </View>
                  </View>
                  {wallet.helpUrl ? (
                    <Pressable
                      accessibilityLabel={`Install or get help for ${wallet.name}`}
                      onPress={() => openHelp(wallet.helpUrl!)}
                      style={styles.helpButton}
                    >
                      <Text style={styles.helpText}>Install / help</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}

              <View style={styles.phantomRow}>
                <View style={styles.rowMain}>
                  <View style={styles.phantomIcon}>
                    <Ionicons name="information-circle-outline" color={colors.warning} size={22} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.walletName}>Phantom</Text>
                    <Text style={styles.walletDetail}>Not available for native SeekerTag connection yet</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Why Phantom native connection is unavailable"
                  disabled={PHANTOM_NATIVE_SUPPORTED}
                  onPress={() => setShowPhantom(true)}
                  style={styles.helpButton}
                >
                  <Text style={styles.phantomHelp}>Why unavailable?</Text>
                </Pressable>
              </View>

              <View style={styles.helpCard}>
                <Ionicons name="settings-outline" color={colors.textMuted} size={18} />
                <Text style={styles.helpCardText}>
                  Wrong wallet opening automatically? Clear that wallet&apos;s Android default and try again.
                </Text>
              </View>
              {helpError ? (
                <Text style={styles.helpError}>The wallet help page could not be opened.</Text>
              ) : null}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  sheet: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: '92%',
    paddingBottom: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    marginTop: spacing.sm,
    width: 42,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  list: { gap: spacing.sm, padding: spacing.md, paddingTop: 0 },
  primaryCard: {
    backgroundColor: '#13251C',
    borderColor: '#28513A',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  primaryCopy: { color: colors.text, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  defaultCopy: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowMain: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  icon: {
    alignItems: 'center',
    backgroundColor: '#183126',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  rowText: { flex: 1 },
  walletName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  walletDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  helpButton: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  helpText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  phantomRow: {
    backgroundColor: colors.surface,
    borderColor: '#5F5131',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  phantomIcon: {
    alignItems: 'center',
    backgroundColor: '#332C1D',
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  phantomHelp: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  helpCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  helpCardText: { color: colors.textMuted, flex: 1, fontSize: 11, lineHeight: 17 },
  sessionNotice: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
  },
  helpError: { color: colors.danger, fontSize: 12, textAlign: 'center' },
  phantomContent: { gap: spacing.sm, padding: spacing.md, paddingTop: 0 },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#5F5131',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.lg,
  },
  noticeTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  noticeBody: { color: colors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
})
