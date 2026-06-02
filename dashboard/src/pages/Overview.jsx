import React, { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import {
  MessageSquare, DollarSign, CheckCircle, AlertTriangle,
  Cpu, Zap, Activity, TrendingUp
} from 'lucide-react'
import KPICard from '../components/KPICard.jsx'
import RealtimeStream from '../components/RealtimeStream.jsx'
import { fetchPlatformStats, fetchAgents, fetchAgentMetrics, fetchHallucinationMetrics } from '../api.js'

const AGENT_COLORS = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#06b6d4']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, fontSize: '0.82rem' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(3) : p.value}
        </div>
      ))}
    </div>
  )
}

export default function Overview() {
  const [stats,    setStats]    = useState(null)
  const [agents,   setAgents]   = useState([])
  const [hallData, setHallData] = useState([])
  const [agentTS,  setAgentTS]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, a, h, ts] = await Promise.all([
          fetchPlatformStats(),
          fetchAgents(),
          fetchHallucinationMetrics(14),
          fetchAgentMetrics('support_agent', 14),
        ])
        setStats(s)
        setAgents(a.agents || [])
        // Pivot hallucination data to per-date aggregated
        const byDate = {}
        ;(h.hallucination_metrics || []).forEach(r => {
          if (!byDate[r.metric_date]) byDate[r.metric_date] = { date: r.metric_date }
          byDate[r.metric_date][r.agent_id] = parseFloat(r.avg_hallucination)
        })
        setHallData(Object.values(byDate).slice(-10))
        setAgentTS(ts.metrics?.map(m => ({
          date:     m.metric_date?.slice(5),
          requests: m.total_requests,
          cost:     parseFloat(m.total_cost),
          latency:  parseFloat(m.avg_latency_ms),
          quality:  parseFloat(m.quality_score),
        })) || [])
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  // Pie data
  const pieData = agents.map((a, i) => ({
    name: a.agent_name?.split(' ')[0] || a.agent_id,
    value: a.total_conversations || 0,
    color: AGENT_COLORS[i % AGENT_COLORS.length],
  }))

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div className="spinner" style={{ margin: '0 auto 12px' }} />
      Loading platform data...
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Executive Overview</h1>
        <p className="page-subtitle">Real-time AI Agent observability & operational intelligence · Last 24 hours</p>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <KPICard icon={MessageSquare} label="Total Conversations"
          value={(stats?.total_conversations || 0).toLocaleString()}
          color="blue" changeLabel="↑ 12% from yesterday" change={1} />
        <KPICard icon={DollarSign} label="Daily Cost"
          value={`$${parseFloat(stats?.total_cost || 0).toFixed(2)}`}
          color="orange" changeLabel="within budget" change={0} />
        <KPICard icon={CheckCircle} label="Success Rate"
          value={`${((stats?.success_rate || 0) * 100).toFixed(1)}%`}
          color="green" changeLabel="↑ 0.8% improvement" change={1} />
        <KPICard icon={AlertTriangle} label="Hallucination Rate"
          value={`${((stats?.avg_hallucination || 0) * 100).toFixed(1)}%`}
          color="red" changeLabel="↓ 2.1% reduced" change={-1} />
        <KPICard icon={Cpu} label="Tokens Consumed"
          value={`${parseFloat(stats?.total_tokens_m || 0).toFixed(1)}M`}
          color="purple" changeLabel="across all agents" change={0} />
        <KPICard icon={Activity} label="Active Agents"
          value={stats?.active_agents || 5}
          color="cyan" changeLabel="all healthy" change={1} />
      </div>

      {/* Charts Row 1 */}
      <div className="charts-grid" style={{ marginBottom: 24 }}>
        {/* Request Trend */}
        <div className="glass-card">
          <div className="card-header">
            <span className="card-title">Daily Request Trend (Support Agent)</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={agentTS}>
              <defs>
                <linearGradient id="gradReq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b9cb5', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="url(#gradReq)"
                strokeWidth={2} name="Requests" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cost Trend */}
        <div className="glass-card">
          <div className="card-header">
            <span className="card-title">Daily Cost Trend (Support Agent)</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={agentTS}>
              <defs>
                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b9cb5', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="cost" stroke="#f59e0b" fill="url(#gradCost)"
                strokeWidth={2} name="Cost $" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="charts-grid" style={{ marginBottom: 24 }}>
        {/* Agent Distribution Pie */}
        <div className="glass-card">
          <div className="card-header">
            <span className="card-title">Conversation Distribution by Agent</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={pieData} cx={95} cy={95} innerRadius={55} outerRadius={90}
                  dataKey="value" paddingAngle={3}>
                  {pieData.map((e, i) => (
                    <Cell key={i} fill={e.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pieData.map((d, i) => {
                const total = pieData.reduce((s, x) => s + x.value, 0)
                const pct   = total ? ((d.value / total) * 100).toFixed(1) : 0
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.name}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pct}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Hallucination Trend */}
        <div className="glass-card">
          <div className="card-header">
            <span className="card-title">Hallucination Score Trend (14d)</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={hallData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#8b9cb5', fontSize: 10 }}
                tickFormatter={v => v?.slice(5) || v} />
              <YAxis tick={{ fill: '#8b9cb5', fontSize: 11 }} domain={[0, 0.3]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
              {['support_agent','coding_agent','sales_agent','hr_agent','knowledge_agent'].map((a, i) => (
                <Line key={a} type="monotone" dataKey={a} stroke={AGENT_COLORS[i]}
                  strokeWidth={2} dot={false} name={a.replace('_agent', '')} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quality Score Bar */}
      <div className="glass-card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Agent Quality Comparison</span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={agents.map(a => ({
            name: a.agent_name?.split(' ')[0] || a.agent_id,
            quality: parseFloat(a.quality_score || 0),
            success: parseFloat(a.success_rate || 0),
          }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fill: '#8b9cb5', fontSize: 12 }} />
            <YAxis tick={{ fill: '#8b9cb5', fontSize: 11 }} domain={[0, 1]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
            <Bar dataKey="quality" name="Quality Score" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="success" name="Success Rate"  fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Realtime Stream */}
      <div className="page-header" style={{ marginTop: 8 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          ⚡ Live Agent Stream
        </h2>
      </div>
      <RealtimeStream />
    </div>
  )
}
