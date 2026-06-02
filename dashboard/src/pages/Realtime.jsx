import React from 'react'
import RealtimeStream from '../components/RealtimeStream.jsx'

export default function Realtime() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Realtime Agent Stream</h1>
        <p className="page-subtitle">Live event metrics from Kafka → Spark Streaming · Auto-refresh every 4 seconds</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', animation: 'pulse-green 2s infinite' }} />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Streaming live from Spark Structured Streaming</span>
      </div>
      <RealtimeStream />
    </div>
  )
}
