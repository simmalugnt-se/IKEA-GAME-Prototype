import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cursorRelayPlugin } from './vite-plugin-cursor-relay'
import { installationStopPlugin } from './vite-plugin-installation-stop'
import { scoreboardSettingsSavePlugin } from './vite-plugin-scoreboard-settings-save'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    cursorRelayPlugin(),
    ...(command === 'serve' ? [scoreboardSettingsSavePlugin(), installationStopPlugin()] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
}))
