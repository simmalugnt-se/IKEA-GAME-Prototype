import { create } from 'zustand'

type SettingsStoreState = {
  version: number
  bump: () => void
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}))

export const bump = () => useSettingsStore.getState().bump()
export const useSettingsVersion = () => useSettingsStore((s) => s.version)
