import type { Item } from '@/types/item'

export const DEMO_OWNER = '8FxWvLQYq2nQzE17eZC7w2ybpAa9FzH9Uocv5gkX39A'
export const DEMO_FINDER = '72AbVzkZ1PU5RHBtExXk2Y8jVKbWdAFuURkNs5wDK91'

export const demoItems: Item[] = [
  {
    id: 'demo-airpods',
    name: 'AirPods Pro',
    description: 'White AirPods Pro in a charcoal case.',
    ownerWallet: DEMO_OWNER,
    status: 'protected',
    createdAt: '2026-09-20T10:30:00.000Z',
    ownershipHistory: [
      {
        id: 'event-demo-1',
        action: 'claimed',
        toWallet: DEMO_OWNER,
        createdAt: '2026-09-20T10:30:00.000Z',
        proof: 'Demo ownership proof',
      },
    ],
  },
  {
    id: 'demo-backpack',
    name: 'Everyday Backpack',
    description: 'Black canvas backpack.',
    ownerWallet: DEMO_OWNER,
    status: 'lost',
    finderRewardAmount: '100',
    createdAt: '2026-09-18T09:00:00.000Z',
    ownershipHistory: [
      {
        id: 'event-demo-2',
        action: 'claimed',
        toWallet: DEMO_OWNER,
        createdAt: '2026-09-18T09:00:00.000Z',
      },
    ],
  },
]

export function getDemoItem(id: string): Item | undefined {
  return demoItems.find((item) => item.id === id)
}
