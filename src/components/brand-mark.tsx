import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, View } from 'react-native'
import { colors } from '@/theme'

export function BrandMark({ size = 42 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Ionicons name="shield-checkmark" size={size * 0.58} color={colors.accent} />
    </View>
  )
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
