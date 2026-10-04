import { StyleSheet, Text, View } from 'react-native'
import type { ItemStatus } from '@/types/item'
import { colors, radius, spacing } from '@/theme'

const labels: Record<ItemStatus, string> = {
  protected: 'Protected',
  lost: 'Lost',
  returned: 'Returned',
}

export function StatusPill({ status }: { status: ItemStatus }) {
  return (
    <View style={[styles.base, status === 'lost' ? styles.lost : styles.protected]}>
      <View style={[styles.dot, status === 'lost' ? styles.lostDot : styles.protectedDot]} />
      <Text style={[styles.text, status === 'lost' ? styles.lostText : styles.protectedText]}>
        {labels[status]}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  protected: { backgroundColor: '#183126' },
  lost: { backgroundColor: colors.dangerSoft },
  dot: { borderRadius: 4, height: 7, width: 7 },
  protectedDot: { backgroundColor: colors.accent },
  lostDot: { backgroundColor: colors.danger },
  text: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  protectedText: { color: colors.accent },
  lostText: { color: colors.danger },
})
