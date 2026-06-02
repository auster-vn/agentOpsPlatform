import React, { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { fetchCostForecasts, fetchAgentMetrics } from '../api.js'

const AGENT_COLORS = {
  support_agent:   '#3b82f6',
  coding_agent:    '#8b5cf6',
  sales_agent:     '#f59e0b',
  hr_agent:        '#10b981',
  knowledge_agent: '#06b6d4',
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontSize: '0.8rem' }}>
          {p.name}: ${typeof p.value === 'number' ? p.value.toFixed(4) : p.value}
        </div>
      ))}
    </div>
  )
}

export default function CostForecast() {
  const [forecasts, setForecasts] = useState([])
  const [historical, setHistorical] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [f, h] = await Promise.all([
          fetchCostForecasts(null, 7),
          fetchAgentMetrics('support_agent', 14),
        ])

        // Pivot forecasts by date
        const byDate = {}
        ;(f.forecasts || []).forEach(r => {
          if (!byDate[r.forecast_date]) byDate[r.forecast_date] = { date: r.forecast_date, type: 'forecast' }
          byDate[r.forecast_date][r.agent_id] = parseFloat(r.predicted_cost)
          byDate[r.forecast_date][`${r.agent_id}_lower`] = parseFloat(r.confidence_lower)
          byDate[r.forecast_date][`${r.agent_id}_upper`] = parseFloat(r.confidence_upper)
        })
        setForecasts(Object.values(byDate))

        // Historical combined cost
        const hist = (h.metrics || []).map(m => ({
          date:    m.metric_date?.slice(5),
          actual:  parseFloat(m.total_cost) || 0,
        }))
        setHistorical(hist)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const agents = ['support_agent', 'coding_agent', 'sales_agent', 'hr_agent', 'knowledge_agent']

  // Total forecast per agent (7-day sum)
  const agentTotals = agents.map(a => ({
    name:  a.replace('_agent', ''),
    total: forecasts.reduce((s, d) => s + (d[a] || 0), 0),
    color: AGENT_COLORS[a],
  }))

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
      <div className="spinner" style={{ margin: '0 auto 12px' }} />
      Loading forecasts...
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cost Forecasts</h1>
        <p className="page-subtitle">7-day predictive cost modeling · XGBoost time-series with confidence intervals</p>
      </div>

      {/* Forecast Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 24 }}>
        {agentTotals.map(a => (
          <div key={a.name} className="glass-card" style={{ padding: '16px', textAlign: 'center',
            borderTop: `3px solid ${a.color}` }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {a.name} (7d)
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              ${a.total.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>predicted</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="glass-card">
          <div className="card-header"><span className="card-title">7-Day Cost Forecast by Agent</span>
            <span className="badge badge-blue">XGBoost Model</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={forecasts} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b9cb5', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(0)}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              {agents.map(a => (
                <Bar key={a} dataKey={a} name={a.replace('_agent', '')}
                  fill={AGENT_COLORS[a]} radius={[3,3,0,0]} stackId="a" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Historical vs Forecast */}
      <div className="glass-card">
        <div className="card-header">
          <span className="card-title">Historical Cost (Support Agent) + 7-day Forecast</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={[
            ...historical.map(h => ({ ...h, type: 'actual' })),
            ...forecasts.slice(0, 7).map(f => ({
              date: f.date?.slice(5),
              forecast: (f.support_agent || 0),
              lower:    (f['support_agent_lower'] || 0),
              upper:    (f['support_agent_upper'] || 0),
              type: 'forecast',
            })),
          ]}>
            <defs>
              <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 10 }} />
            <YAxis tick={{ fill: '#8b9cb5', fontSize: 11 }} tickFormatter={v => `$${v.toFixed(0)}`} />
            <Tooltip />
            <ReferenceLine x={historical[historical.length - 1]?.date} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Today', fill: '#f59e0b', fontSize: 11 }} />
            <Area type="monotone" dataKey="actual"   stroke="#3b82f6" fill="url(#gradActual)"   strokeWidth={2} name="Actual Cost" dot={false} />
            <Area type="monotone" dataKey="forecast" stroke="#8b5cf6" fill="url(#gradForecast)" strokeWidth={2} name="Forecast"    dot={false} strokeDasharray="5 3" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
