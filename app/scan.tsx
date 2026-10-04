import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Screen } from '@/components/screen'
import { appConfig } from '@/config/app-config'
import { parseSeekerTagQr } from '@/lib/qr'
import { colors, radius, spacing } from '@/theme'

export default function ScanScreen() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleScan = ({ data }: BarcodeScanningResult) => {
    if (scanned) return
    setScanned(true)
    const itemId = parseSeekerTagQr(data, appConfig.demoMode)
    if (!itemId) {
      setError('That QR is not a valid SeekerTag. No link or transaction was opened.')
      return
    }
    router.replace({ pathname: '/public-item/[id]', params: { id: itemId } })
  }

  if (!permission) {
    return (
      <Screen back scroll={false} title="Scan a tag">
        <View style={styles.centerState}>
          <Text style={styles.securityText}>Checking camera access…</Text>
        </View>
      </Screen>
    )
  }

  if (!permission.granted) {
    return (
      <Screen back scroll={false} title="Camera access">
        <View style={styles.permissionCard}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" color={colors.accent} size={36} />
          </View>
          <Text style={styles.permissionTitle}>Scan SeekerTag QR codes</Text>
          <Text style={styles.permissionBody}>Camera access is used only while this scanner is open.</Text>
          <AppButton label="Allow camera" onPress={() => void requestPermission()} />
          {!permission.canAskAgain ? (
            <Text style={styles.errorText}>
              Camera permission is blocked. Enable it in Android Settings to scan tags.
            </Text>
          ) : null}
        </View>
      </Screen>
    )
  }

  return (
    <Screen back scroll={false} title="Scan a tag" subtitle="Only SeekerTag item codes are accepted.">
      <View style={styles.content}>
        <View style={styles.cameraFrame}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleScan}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.scanReticle}>
            <Ionicons name="scan-outline" size={180} color={error ? colors.danger : colors.accent} />
          </View>
        </View>
        <Text style={styles.cameraText}>{error ?? 'Position a SeekerTag QR inside the frame'}</Text>
        {scanned ? (
          <AppButton
            label="Scan again"
            variant="secondary"
            onPress={() => {
              setScanned(false)
              setError(null)
            }}
          />
        ) : null}
        <View style={styles.securityNote}>
          <Ionicons name="shield-outline" color={colors.textMuted} size={19} />
          <Text style={styles.securityText}>Scanning never signs or sends a transaction automatically.</Text>
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.lg, justifyContent: 'center', paddingBottom: spacing.xl },
  cameraFrame: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scanReticle: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  cameraText: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  securityNote: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  securityText: { color: colors.textMuted, flexShrink: 1, fontSize: 12, lineHeight: 17 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  permissionCard: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginTop: spacing.xxl,
    padding: spacing.lg,
    width: '100%',
  },
  permissionIcon: {
    alignItems: 'center',
    backgroundColor: '#183126',
    borderRadius: radius.md,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  permissionTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  permissionBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
