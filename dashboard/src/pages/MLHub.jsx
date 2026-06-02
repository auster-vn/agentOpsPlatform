import React, { useState, useEffect } from 'react'
import { Brain, Zap, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { predictHallucination, predictFailure } from '../api.js'

const AGENTS = ['support_agent','coding_agent','sales_agent','hr_agent','knowledge_agent']

function ScoreGauge({ value, color, label }) {
  const pct     = Math.round(value * 100)
  const radius  = 48
  const circ    = 2 * Math.PI * radius
  const offset  = circ * (1 - value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={60} cy={60} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
        <circle cx={60} cy={60} r={radius} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dashoffset 0.8s ease' }} />
        <text x={60} y={60} dominantBaseline="middle" textAnchor="middle"
          fill="white" fontSize={22} fontWeight={800} fontFamily="Inter, sans-serif">
          {pct}%
        </text>
        <text x={60} y={80} dominantBaseline="middle" textAnchor="middle"
          fill="#8b9cb5" fontSize={9} fontFamily="Inter, sans-serif">
          PROBABILITY
        </text>
      </svg>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: 600 }}>{label}</div>
    </div>
  )
}

function HallucinationHubTab() {
  const [form, setForm]     = useState({
    question: 'How do I reset my password?',
    context:  'According to our internal documentation, users can reset their password by clicking the Forgot Password link on the login page and entering their registered email address.',
    response: '',
  })
  const [result,   setResult]   = useState(null)
  const [loading,  setLoading]  = useState(false)

  const presets = [
    {
      label: '✅ Good Response',
      question: 'How do I reset my password?',
      context:  'According to our documentation, click Forgot Password and enter your email.',
      response: 'To reset your password, click Forgot Password on the login page and follow the email instructions.',
    },
    {
      label: '⚠️ Hallucinated Response',
      question: 'What is our data retention policy?',
      context:  'We retain data for 90 days per the privacy policy.',
      response: 'We retain your data forever and may sell it to third parties.',
    },
    {
      label: '🔥 Obvious Hallucination',
      question: 'What are our API rate limits?',
      context:  'Rate limits: 1000 req/min standard, 10000 req/min enterprise.',
      response: 'There are no rate limits on our platform.',
    },
  ]

  const run = async () => {
    if (!form.response.trim()) return toast.error('Please enter an agent response to evaluate.')
    setLoading(true)
    try {
      const res = await predictHallucination(form)
      setResult(res)
      toast.success('Hallucination analysis complete!')
    } catch (e) {
      toast.error('API error – check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {/* Input */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            🔬 Evaluate Agent Response
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {presets.map(p => (
              <button key={p.label} className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                onClick={() => setForm({ question: p.question, context: p.context, response: p.response })}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">User Question</label>
          <input className="form-input" value={form.question}
            onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Context / Knowledge Source</label>
          <textarea className="form-textarea" value={form.context}
            onChange={e => setForm(f => ({ ...f, context: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Agent Response to Evaluate</label>
          <textarea className="form-textarea" value={form.response}
            placeholder="Enter the agent's response here..."
            onChange={e => setForm(f => ({ ...f, response: e.target.value }))} />
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={run} disabled={loading}>
          {loading ? <><div className="spinner" />Analyzing...</> : <><Brain size={16} />Detect Hallucination</>}
        </button>
      </div>

      {/* Result */}
      <div>
        {result ? (
          <div className="glass-card" style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Analysis Result
            </h3>

            <ScoreGauge
              value={result.hallucination_probability}
              color={result.is_hallucinated ? '#ef4444' : '#10b981'}
              label="Hallucination Probability"
            />

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Verdict */}
              <div style={{
                background: result.is_hallucinated ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${result.is_hallucinated ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                borderRadius: 10, padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
              }}>
                {result.is_hallucinated
                  ? <AlertCircle size={18} color="#ef4444" />
                  : <CheckCircle2 size={18} color="#10b981" />}
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: result.is_hallucinated ? '#ef4444' : '#10b981' }}>
                  {result.is_hallucinated ? '⚠️ HALLUCINATION DETECTED' : '✅ RESPONSE APPEARS GROUNDED'}
                </span>
              </div>

              {/* Details */}
              {[
                { label: 'Similarity Score',   value: `${(result.similarity_score * 100).toFixed(1)}%` },
                { label: 'Confidence Level',   value: result.confidence?.toUpperCase() },
                { label: 'Model Used',         value: result.model_used },
                { label: 'Inference Time',     value: `${result.inference_ms}ms` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ textAlign: 'center', padding: '60px 32px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧠</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Enter an agent response and click<br /><strong style={{ color: 'var(--accent-blue)' }}>Detect Hallucination</strong> to see results.
            </div>
            <div style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Powered by Sentence-Transformers (all-MiniLM-L6-v2)<br />
              Cosine similarity between context and response embedding
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FailurePredictorTab() {
  const [form, setForm]    = useState({ agent_id: 'support_agent', latency_ms: 1200, token_count: 450, cost: 0.009, tool_count: 2 })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const scenarios = [
    { label: '🟢 Low Risk',  latency_ms: 400,  token_count: 200, cost: 0.004, tool_count: 0 },
    { label: '🟡 Medium',    latency_ms: 1800, token_count: 800, cost: 0.018, tool_count: 3 },
    { label: '🔴 High Risk', latency_ms: 4500, token_count: 2000, cost: 0.06, tool_count: 6 },
  ]

  const run = async () => {
    setLoading(true)
    try {
      const res = await predictFailure(form)
      setResult(res)
      toast.success('Failure prediction complete!')
    } catch (e) {
      toast.error('API error – check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const riskColor = { low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#ef4444' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {/* Input */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            ⚡ Predict Agent Failure
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {scenarios.map(s => (
              <button key={s.label} className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                onClick={() => setForm(f => ({ ...f, ...s }))}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Agent</label>
          <select className="form-select" value={form.agent_id}
            onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}>
            {AGENTS.map(a => <option key={a} value={a}>{a.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
        </div>

        {[
          { key: 'latency_ms',  label: 'Latency (ms)',  type: 'number', min: 0,    max: 60000 },
          { key: 'token_count', label: 'Token Count',   type: 'number', min: 0,    max: 8000  },
          { key: 'cost',        label: 'Cost ($)',       type: 'number', min: 0,    max: 1, step: 0.001 },
          { key: 'tool_count',  label: 'Tool Calls',    type: 'number', min: 0,    max: 20 },
        ].map(({ key, label, ...rest }) => (
          <div key={key} className="form-group">
            <label className="form-label">{label}</label>
            <input className="form-input" {...rest} value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))} />
          </div>
        ))}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={run} disabled={loading}>
          {loading ? <><div className="spinner" />Predicting...</> : <><Zap size={16} />Predict Failure Risk</>}
        </button>
      </div>

      {/* Result */}
      <div>
        {result ? (
          <div className="glass-card">
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Prediction Result
            </h3>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <ScoreGauge
                value={result.failure_probability}
                color={riskColor[result.risk_level] || '#f59e0b'}
                label="Failure Probability"
              />
            </div>

            {/* Risk Badge */}
            <div style={{
              textAlign: 'center', marginBottom: 16, fontSize: '1rem', fontWeight: 700,
              color: riskColor[result.risk_level],
            }}>
              Risk Level: {result.risk_level?.toUpperCase()}
            </div>

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Contributing Factors
              </div>
              {result.contributing_factors?.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 8, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  ⚡ {f}
                </div>
              ))}
              {[
                { label: 'Will Fail',     value: result.will_fail ? 'YES' : 'NO' },
                { label: 'Model',         value: result.model_used },
                { label: 'Latency (infer)', value: `${result.inference_ms}ms` },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-card" style={{ textAlign: 'center', padding: '60px 32px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Set operational parameters and click<br /><strong style={{ color: 'var(--accent-blue)' }}>Predict Failure Risk</strong>
            </div>
            <div style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Powered by XGBoost classifier<br />
              Features: latency, tokens, cost, tool count, agent type
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MLHub() {
  const [tab, setTab] = useState('hallucination')

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ML Inference Hub</h1>
        <p className="page-subtitle">
          Interactive real-time inference · Hallucination Detection (Sentence-Transformers) · Failure Prediction (XGBoost)
        </p>
      </div>

      {/* Model Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
        {[
          {
            icon: '🧠', name: 'Hallucination Detector', status: 'Active',
            model: 'all-MiniLM-L6-v2 + LR', metric: 'ROC-AUC: 0.91', color: '#3b82f6',
          },
          {
            icon: '⚡', name: 'Failure Predictor', status: 'Active',
            model: 'XGBoost (n=300)', metric: 'AUC-PR: 0.87', color: '#f59e0b',
          },
          {
            icon: '📈', name: 'Cost Forecaster', status: 'Active',
            model: 'XGBoost Regressor', metric: 'MAE: $1.24', color: '#10b981',
          },
        ].map(m => (
          <div key={m.name} className="glass-card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: '1.4rem' }}>{m.icon}</span>
              <span className="badge badge-green" style={{ fontSize: '0.68rem' }}>● {m.status}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 4 }}>{m.name}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>{m.model}</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: m.color, fontFamily: 'var(--font-mono)' }}>{m.metric}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab-btn${tab === 'hallucination' ? ' active' : ''}`} onClick={() => setTab('hallucination')}>
          🧠 Hallucination Detection
        </button>
        <button className={`tab-btn${tab === 'failure' ? ' active' : ''}`} onClick={() => setTab('failure')}>
          ⚡ Failure Prediction
        </button>
      </div>

      {tab === 'hallucination' ? <HallucinationHubTab /> : <FailurePredictorTab />}
    </div>
  )
}
