import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#111c35',
          color: '#f0f6ff',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '12px',
          fontSize: '0.85rem',
        },
      }}
    />
  </React.StrictMode>,
)
