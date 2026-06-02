import React, { useState, useEffect, useRef } from 'react'
import { fetchRealtimeMetrics } from '../api.js'

const AGENT_COLORS = {
  support_agent:   '#3b82f6',
  coding_agent:    '#8b5cf6',
  sales_agent:     '#f59e0b',
  hr_agent:        '#10b981',
  knowledge_agent: '#06b6d4',
}

const AGENT_LABELS = {
  support_agent:   'Support',
  coding_agent:    'Coding',
  sales_agent:     'Sales',
  hr_agent:        'HR',
  knowledge_agent: 'Knowledge',
}

function Spark({ values = [], color = '#3b82f6', height = 36 }) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${((1 - v / max) * height).toFixed(1)}`)
    .join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  )
}

export default function RealtimeStream() {
  const [metrics, setMetrics] = useState({})
  const histRef = useRef({})  // ring buffer: 30 ticks per agent

  useEffect(() => {
    const tick = async () => {
      try {
        const data = await fetchRealtimeMetrics()
        const items = data.realtime || []
        items.forEach(item => {
          const id = item.agent_id
          if (!histRef.current[id]) histRef.current[id] = []
          histRef.current[id].push(item.request_count ?? 0)
          if (histRef.current[id].length > 30) histRef.current[id].shift()
        })
        const m = {}
        items.forEach(item => { m[item.agent_id] = item })
        setMetrics(m)
      } catch (e) { /* silent */ }
    }
    tick()
    const iv = setInterval(tick, 4000)
    return () => clearInterval(iv)
  }, [])

  const agents = Object.keys(AGENT_COLORS)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 16 }}>
      {agents.map(agent => {
        const m = metrics[agent] || {}
        const hist = histRef.current[agent] || []
        const color = AGENT_COLORS[agent]

        return (
          <div key={agent} className="glass-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {AGENT_LABELS[agent]}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1, marginTop: 2 }}>
                  {m.request_count ?? '—'}
                  <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>req/min</span>
                </div>
              </div>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: `${color}22`,
                border: `2px solid ${color}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, animation: 'pulse-green 2s infinite' }} />
              </div>
            </div>

            {/* Sparkline */}
            <div style={{ marginBottom: 12 }}>
              <Spark values={hist} color={color} />
            </div>

            {/* Mini stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Latency</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {m.avg_latency_ms ? `${Math.round(m.avg_latency_ms)}ms` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Error Rate</div>
                <div style={{
                  fontSize: '0.88rem', fontWeight: 700,
                  color: m.error_rate > 0.1 ? 'var(--accent-red)' : m.error_rate > 0.05 ? 'var(--accent-orange)' : 'var(--accent-green)'
                }}>
                  {m.error_rate != null ? `${(m.error_rate * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Tokens</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {m.total_tokens ? `${(m.total_tokens / 1000).toFixed(1)}K` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Cost</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  {m.total_cost ? `$${m.total_cost.toFixed(3)}` : '—'}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
