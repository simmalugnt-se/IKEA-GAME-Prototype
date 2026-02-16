import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css' // Se till att din CSS importeras här

// Viktigt: 'root' måste matcha id:t i din index.html
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)