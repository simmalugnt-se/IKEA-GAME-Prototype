export function isInstallationStopShortcut(event: KeyboardEvent): boolean {
  if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    return event.code === 'KeyX'
  }

  if (!event.ctrlKey || !event.altKey || !event.shiftKey) return false
  return event.code === 'KeyQ' || event.code === 'Escape'
}

export function requestInstallationStop(): void {
  void fetch('/__dev/installation/stop', {
    method: 'POST',
    keepalive: true,
  }).catch((error) => {
    console.error('[installation] stop request failed', error)
  })
}
