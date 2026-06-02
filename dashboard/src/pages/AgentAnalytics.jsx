import React, { useEffect, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { fetchAgents, fetchAgentMetrics } from '../api.js'

const AGENT_COLORS = {
  support_agent:   '#3b82f6',
  coding_agent:    '#8b5cf6',
  sales_agent:     '#f59e0b',
  hr_agent:        '#10b981',
  knowledge_agent: '#06b6d4',
}

function QualityBar({ value, max = 1, color }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', minWidth: 38, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: {typeof p.value === 'number' ? (p.value * 100).toFixed(1) : p.value}%
        </div>
      ))}
    </div>
  )
}

export default function AgentAnalytics() {
  const [agents,  setAgents]  = useState([])
  const [selected, setSelected] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [days,    setDays]    = useState(14)

  useEffect(() => {
    fetchAgents().then(d => {
      const a = d.agents || []
      setAgents(a)
      if (a.length) setSelected(a[0].agent_id)
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    fetchAgentMetrics(selected, days).then(d => {
      setMetrics((d.metrics || []).map(m => ({
        date:        m.metric_date?.slice(5) || '',
        requests:    m.total_requests || 0,
        cost:        parseFloat(m.total_cost) || 0,
        latency:     parseFloat(m.avg_latency_ms) || 0,
        success:     parseFloat(m.success_rate) || 0,
        error:       parseFloat(m.error_rate) || 0,
        hallucination: parseFloat(m.avg_hallucination_score) || 0,
        quality:     parseFloat(m.quality_score) || 0,
      })))
    })
  }, [selected, days])

  const selectedAgent = agents.find(a => a.agent_id === selected) || {}

  // Radar data for selected agent
  const radarData = [
    { metric: 'Success Rate',     value: (selectedAgent.success_rate || 0) * 100 },
    { metric: 'Quality Score',    value: (selectedAgent.quality_score || 0) * 100 },
    { metric: 'Low Hallucination',value: (1 - (selectedAgent.avg_hallucination_score || 0)) * 100 },
    { metric: 'Low Error Rate',   value: (1 - (1 - (selectedAgent.success_rate || 0))) * 100 },
    { metric: 'Efficiency',       value: Math.max(0, 100 - (selectedAgent.avg_latency_ms || 0) / 30) },
  ]

  const color = AGENT_COLORS[selected] || '#3b82f6'

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Agent Analytics</h1>
        <p className="page-subtitle">Per-agent deep dive · quality scores · latency · cost breakdown</p>
      </div>

      {/* Agent Selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {agents.map(a => (
          <button
            key={a.agent_id}
            onClick={() => setSelected(a.agent_id)}
            style={{
              padding: '8px 18px', borderRadius: 10, border: '1px solid',
              background: selected === a.agent_id ? `${AGENT_COLORS[a.agent_id]}22` : 'transparent',
              borderColor: selected === a.agent_id ? AGENT_COLORS[a.agent_id] : 'var(--border-subtle)',
              color: selected === a.agent_id ? AGENT_COLORS[a.agent_id] : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              transition: 'all 0.15s', fontFamily: 'var(--font-sans)',
            }}
          >
            {a.agent_name?.split(' ')[0] || a.agent_id}
          </button>
        ))}
        <select
          className="form-select"
          style={{ width: 130, padding: '8px 12px' }}
          value={days}
          onChange={e => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {/* Agent Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Conversations', value: (selectedAgent.total_conversations || 0).toLocaleString() },
          { label: 'Avg Latency',         value: `${Math.round(selectedAgent.avg_latency_ms || 0)}ms` },
          { label: 'Success Rate',        value: `${((selectedAgent.success_rate || 0) * 100).toFixed(1)}%` },
          { label: 'Avg Cost / Call',     value: `$${(selectedAgent.avg_cost_per_call || 0).toFixed(4)}` },
          { label: 'Quality Score',       value: (selectedAgent.quality_score || 0).toFixed(3) },
        ].map(({ label, value }) => (
          <div key={label} className="glass-card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="charts-grid" style={{ marginBottom: 24 }}>
        {/* Radar Chart */}
        <div className="glass-card">
          <div className="card-header"><span className="card-title">Performance Profile</span></div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#8b9cb5', fontSize: 11 }} />
              <Radar name="Score" dataKey="value" stroke={color} fill={color} fillOpacity={0.2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Quality Breakdown */}
        <div className="glass-card">
          <div className="card-header"><span className="card-title">Quality Metrics Breakdown</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Success Rate',       value: selectedAgent.success_rate || 0,       color: '#10b981' },
              { label: 'Quality Score',      value: selectedAgent.quality_score || 0,      color: '#3b82f6' },
              { label: 'Grounded Responses', value: 1 - (selectedAgent.avg_hallucination_score || 0), color: '#8b5cf6' },
              { label: 'Avg Tokens (norm)',  value: Math.min(1, (selectedAgent.avg_tokens || 0) / 2000), color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <QualityBar value={value} color={color} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Time-series charts */}
      <div className="charts-grid" style={{ marginBottom: 24 }}>
        <div className="glass-card">
          <div className="card-header"><span className="card-title">Quality & Success Trend</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 10 }} />
              <YAxis tick={{ fill: '#8b9cb5', fontSize: 10 }} domain={[0, 1]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              <Line type="monotone" dataKey="quality"  stroke={color}    strokeWidth={2} dot={false} name="Quality" />
              <Line type="monotone" dataKey="success"  stroke="#10b981"  strokeWidth={2} dot={false} name="Success" />
              <Line type="monotone" dataKey="hallucination" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Hallucination" strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card">
          <div className="card-header"><span className="card-title">Latency Trend (ms)</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 10 }} />
              <YAxis tick={{ fill: '#8b9cb5', fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} dot={false} name="Latency (ms)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* All Agents Table */}
      <div className="glass-card">
        <div className="card-header"><span className="card-title">All Agents Comparison</span></div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th><th>Conversations</th><th>Avg Latency</th>
              <th>Success Rate</th><th>Hallucination</th><th>Quality Score</th><th>Daily Cost</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.agent_id} style={{ cursor: 'pointer' }} onClick={() => setSelected(a.agent_id)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: AGENT_COLORS[a.agent_id] }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{a.agent_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{a.agent_type}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{(a.total_conversations || 0).toLocaleString()}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(a.avg_latency_ms || 0)}ms</td>
                <td>
                  <span className={`badge ${(a.success_rate || 0) > 0.9 ? 'badge-green' : 'badge-orange'}`}>
                    {((a.success_rate || 0) * 100).toFixed(1)}%
                  </span>
                </td>
                <td>
                  <span className={`badge ${(a.avg_hallucination_score || 0) > 0.15 ? 'badge-red' : 'badge-green'}`}>
                    {((a.avg_hallucination_score || 0) * 100).toFixed(1)}%
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ width: 60 }}>
                      <div className="progress-fill" style={{ width: `${(a.quality_score || 0) * 100}%`, background: AGENT_COLORS[a.agent_id] }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700 }}>
                      {(a.quality_score || 0).toFixed(3)}
                    </span>
                  </div>
                </td>
                <td style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  ${(a.total_cost || 0).toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
