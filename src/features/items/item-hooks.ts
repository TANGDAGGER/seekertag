import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ImagePickerAsset } from 'expo-image-picker'
import {
  createFinderReport,
  createItem,
  getFinderReport,
  getItem,
  listFinderReports,
  listItems,
  markItemLost,
  transferItemOwnership,
} from '@/lib/item-service'

export function useItems(ownerWallet?: string) {
  return useQuery({
    queryKey: ['items', ownerWallet],
    queryFn: () => listItems(ownerWallet!),
    enabled: Boolean(ownerWallet),
  })
}

export function useItem(id?: string) {
  return useQuery({
    queryKey: ['item', id],
    queryFn: () => getItem(id!),
    enabled: Boolean(id),
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      itemId: string
      ownerWallet: string
      name: string
      description?: string
      image?: ImagePickerAsset
    }) => createItem(input),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: ['items', item.ownerWallet] })
      queryClient.setQueryData(['item', item.id], item)
    },
  })
}

export function useMarkItemLost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, rewardAmount }: { itemId: string; rewardAmount: string }) =>
      markItemLost(itemId, rewardAmount),
    onSuccess: (item) => {
      queryClient.setQueryData(['item', item.id], item)
      void queryClient.invalidateQueries({ queryKey: ['items', item.ownerWallet] })
    },
  })
}

export function useFinderReports(itemId?: string) {
  return useQuery({
    queryKey: ['finder-reports', itemId],
    queryFn: () => listFinderReports(itemId!),
    enabled: Boolean(itemId),
  })
}

export function useFinderReport(reportId?: string) {
  return useQuery({
    queryKey: ['finder-report', reportId],
    queryFn: () => getFinderReport(reportId!),
    enabled: Boolean(reportId),
  })
}

export function useCreateFinderReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createFinderReport,
    onSuccess: (report) => {
      queryClient.setQueryData(['finder-report', report.id], report)
      void queryClient.invalidateQueries({ queryKey: ['finder-reports', report.itemId] })
    },
  })
}

export function useTransferOwnership() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: transferItemOwnership,
    onSuccess: (item) => {
      queryClient.setQueryData(['item', item.id], item)
      void queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
