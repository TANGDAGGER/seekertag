import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/app-button'
import { Field } from '@/components/field'
import { Screen } from '@/components/screen'
import { isSupabaseConfigured } from '@/config/supabase'
import { useCreateItem } from '@/features/items/item-hooks'
import { useSeekerWallet } from '@/features/wallet/wallet-provider'
import { createId } from '@/lib/id'
import { authenticateWallet } from '@/lib/wallet-auth'
import { colors, radius, spacing } from '@/theme'

export default function AddItemScreen() {
  const router = useRouter()
  const { account, signMessages } = useSeekerWallet()
  const createItem = useCreateItem()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset>()
  const [error, setError] = useState<string | null>(null)

  const pickImage = async () => {
    setError(null)
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError('Photo access was denied. You can still register the item without a photo.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    })
    if (!result.canceled) setImage(result.assets[0])
  }

  const claimOwnership = async () => {
    setError(null)
    if (!account) {
      setError('Connect your wallet from Home before claiming an item.')
      return
    }
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add the two Supabase values in .env, then restart the app.')
      return
    }

    const itemId = createId()
    const ownerWallet = String(account.address)
    try {
      await authenticateWallet(ownerWallet, signMessages)
      const item = await createItem.mutateAsync({
        itemId,
        ownerWallet,
        name,
        description,
        image,
      })
      Alert.alert('Ownership claimed', `${item.name} is now protected by SeekerTag.`)
      router.replace({ pathname: '/item/[id]', params: { id: item.id } })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The item could not be registered.'
      if (message.toLowerCase().includes('cancel') || message.toLowerCase().includes('reject')) {
        setError('The ownership signature was cancelled. No item was created.')
      } else {
        setError(message)
      }
    }
  }

  return (
    <Screen back title="Add item" subtitle="Create a verified ownership profile.">
      <View style={styles.content}>
        <Pressable onPress={pickImage} style={({ pressed }) => [styles.photo, pressed && styles.pressed]}>
          {image ? (
            <Image contentFit="cover" source={{ uri: image.uri }} style={styles.selectedImage} />
          ) : (
            <>
              <View style={styles.photoIcon}>
                <Ionicons name="camera-outline" size={30} color={colors.accent} />
              </View>
              <Text style={styles.photoTitle}>Add a clear photo</Text>
              <Text style={styles.photoHint}>A simple photo helps a finder identify your item.</Text>
            </>
          )}
        </Pressable>

        <Field label="Item name" onChangeText={setName} placeholder="My AirPods Pro" value={name} />
        <Field
          label="Description (optional)"
          multiline
          onChangeText={setDescription}
          placeholder="White AirPods Pro in a charcoal case"
          value={description}
        />

        <View style={styles.proofNote}>
          <Ionicons name="finger-print-outline" color={colors.accent} size={23} />
          <View style={styles.proofText}>
            <Text style={styles.proofTitle}>Claim with your wallet</Text>
            <Text style={styles.proofBody}>
              You will review and sign an ownership statement. SeekerTag never asks for a seed phrase.
            </Text>
          </View>
        </View>

        <AppButton
          disabled={!name.trim()}
          icon="shield-checkmark-outline"
          label="Claim ownership"
          loading={createItem.isPending}
          onPress={claimOwnership}
        />
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <AppButton label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.lg },
  photo: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 190,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  selectedImage: { height: 190, width: '100%' },
  photoIcon: {
    alignItems: 'center',
    backgroundColor: '#183126',
    borderRadius: radius.md,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  photoTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  photoHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  proofNote: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  proofText: { flex: 1 },
  proofTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  proofBody: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  pressed: { opacity: 0.75 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
