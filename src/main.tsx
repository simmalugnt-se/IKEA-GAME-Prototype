import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css' // Se till att din CSS importeras här
import { initDiagnosticsLogger } from '@/diagnostics/diagnosticsLogger'
import { initWebglInitFailureRecovery } from '@/installationWatchdog'

// Viktigt: 'root' måste matcha id:t i din index.html
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Missing #root element in index.html')
}

initDiagnosticsLogger()
initWebglInitFailureRecovery()

const strictModeEnabled = import.meta.env.VITE_REACT_STRICT_MODE === 'true'
const app = strictModeEnabled ? (
  <React.StrictMode>
    <App />
  </React.StrictMode>
) : (
  <App />
)

ReactDOM.createRoot(rootElement).render(app)
