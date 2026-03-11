import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { cursorRelayPlugin } from './vite-plugin-cursor-relay'
import { scoreboardSettingsSavePlugin } from './vite-plugin-scoreboard-settings-save'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    cursorRelayPlugin(),
    ...(command === 'serve' ? [scoreboardSettingsSavePlugin()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
}))
