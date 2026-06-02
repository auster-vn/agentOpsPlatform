import React, { useEffect, useState } from 'react'
import { fetchAgents } from '../api.js'

const AGENT_COLORS = {
  support_agent: '#3b82f6', coding_agent: '#8b5cf6',
  sales_agent: '#f59e0b', hr_agent: '#10b981', knowledge_agent: '#06b6d4',
}

function QualityRing({ score }) {
  const pct    = score * 100
  const r      = 28
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - score)
  const color  = score > 0.8 ? '#10b981' : score > 0.6 ? '#f59e0b' : '#ef4444'

  return (
    <svg width={70} height={70} viewBox="0 0 70 70">
      <circle cx={35} cy={35} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '35px 35px', transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x={35} y={35} dominantBaseline="middle" textAnchor="middle"
        fill="white" fontSize={13} fontWeight={800} fontFamily="Inter, sans-serif">
        {pct.toFixed(0)}
      </text>
    </svg>
  )
}

export default function QualityScores() {
  const [agents, setAgents] = useState([])

  useEffect(() => {
    fetchAgents().then(d => setAgents(d.agents || []))
  }, [])

  const sorted = [...agents].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Agent Quality Scores</h1>
        <p className="page-subtitle">
          Composite score = 0.4 × Success + 0.3 × (1 - Failure P) − 0.2 × Hallucination − 0.1 × Error Rate
        </p>
      </div>

      {/* Top row: ranked cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 28 }}>
        {sorted.map((a, i) => {
          const color  = AGENT_COLORS[a.agent_id] || '#3b82f6'
          const score  = a.quality_score || 0
          const medals = ['🥇','🥈','🥉','4️⃣','5️⃣']
          return (
            <div key={a.agent_id} className="glass-card" style={{ textAlign: 'center', padding: '24px 20px', borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>{medals[i]}</div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4, color: 'var(--text-primary)' }}>
                {a.agent_name}
              </div>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                <QualityRing score={score} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Success', value: `${((a.success_rate || 0)*100).toFixed(1)}%`, color: '#10b981' },
                  { label: 'Hallucin.', value: `${((a.avg_hallucination_score || 0)*100).toFixed(1)}%`, color: '#ef4444' },
                  { label: 'Avg Cost', value: `$${(a.avg_cost_per_call || 0).toFixed(5)}`, color: '#f59e0b' },
                ].map(({ label, value, color: c }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontWeight: 700, color: c, fontFamily: 'var(--font-mono)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Formula explanation */}
      <div className="glass-card" style={{ background: 'linear-gradient(135deg,rgba(59,130,246,0.06),rgba(139,92,246,0.06))' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 14, color: 'var(--text-primary)' }}>
          📐 Quality Score Formula
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--accent-blue)', background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '14px 20px', lineHeight: 2 }}>
          Q = <span style={{ color: '#10b981' }}>0.40 × success_rate</span>{' '}
            + <span style={{ color: '#3b82f6' }}>0.30 × (1 − failure_prob)</span>{' '}
            − <span style={{ color: '#ef4444' }}>0.20 × hallucination_rate</span>{' '}
            − <span style={{ color: '#f59e0b' }}>0.10 × error_rate</span>
        </div>
        <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Scores range from 0 (worst) to 1 (best). Threshold: ≥ 0.80 = Excellent · 0.60–0.80 = Good · &lt; 0.60 = Needs Improvement
        </div>
      </div>
    </div>
  )
}
