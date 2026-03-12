import { useEffect } from 'react'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'

export function UiStyleVarsRuntime() {
  const settingsVersion = useSettingsVersion()

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.setProperty('--ui-shadow-color', SETTINGS.colors.shadow)
  }, [settingsVersion])

  return null
}

