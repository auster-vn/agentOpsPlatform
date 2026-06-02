import React, { useEffect, useState } from 'react'
import { fetchPipelineStatus } from '../api.js'

function StatusBadge({ status }) {
  const map = {
    healthy: { cls: 'badge-green',  dot: '#10b981', label: '● Healthy'  },
    running: { cls: 'badge-green',  dot: '#10b981', label: '● Running'  },
    warning: { cls: 'badge-yellow', dot: '#f59e0b', label: '⚠ Warning'  },
    error:   { cls: 'badge-red',    dot: '#ef4444', label: '✕ Error'    },
  }
  const cfg = map[status?.toLowerCase()] || map.warning
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
}

export default function PipelineStatus() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const load = () => fetchPipelineStatus().then(setData).catch(() => {})
    load()
    const iv = setInterval(load, 15000)
    return () => clearInterval(iv)
  }, [])

  if (!data) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div className="spinner" style={{ margin: '0 auto 12px' }} />
      Loading pipeline status...
    </div>
  )

  const components = [
    {
      name: 'Apache Kafka',
      icon: '📨',
      status: data.kafka?.status,
      stats: [
        { label: 'Throughput',     value: `${data.kafka?.throughput_per_sec || 0} ev/s` },
        { label: 'Consumer Lag',   value: `${data.kafka?.consumer_lag || 0} msgs` },
        { label: 'Topics',         value: (data.kafka?.topics || []).length },
      ],
      detail: (data.kafka?.topics || []).join(', '),
    },
    {
      name: 'Spark Streaming',
      icon: '⚡',
      status: data.spark_streaming?.status,
      stats: [
        { label: 'Records / min',  value: (data.spark_streaming?.records_processed_last_min || 0).toLocaleString() },
        { label: 'Checkpoint',     value: data.spark_streaming?.checkpoint },
      ],
    },
    {
      name: 'MinIO Data Lake',
      icon: '🗄️',
      status: data.minio?.status,
      stats: [
        { label: 'Buckets', value: (data.minio?.buckets || []).join(', ') },
        { label: 'Architecture', value: 'Bronze / Silver / Gold' },
      ],
    },
    {
      name: 'MLflow',
      icon: '🧪',
      status: data.mlflow?.status,
      stats: [
        { label: 'Experiments',       value: data.mlflow?.experiments },
        { label: 'Registered Models', value: data.mlflow?.registered_models },
      ],
    },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pipeline Status</h1>
        <p className="page-subtitle">
          Real-time infrastructure health · Updated every 15s ·
          <span style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {new Date(data.updated_at).toLocaleTimeString()}
          </span>
        </p>
      </div>

      {/* Component Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {components.map(c => (
          <div key={c.name} className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem' }}>{c.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{c.name}</div>
                  {c.detail && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.detail}</div>}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${c.stats.length}, 1fr)`, gap: 12 }}>
              {c.stats.map(s => (
                <div key={s.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Airflow DAGs */}
      <div className="glass-card">
        <div className="card-header">
          <span className="card-title">Airflow DAG Status</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>🌀 Apache Airflow 2.9</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>DAG ID</th>
              <th>Last Run</th>
              <th>Next Run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data.airflow?.dags || []).map(d => (
              <tr key={d.dag_id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-blue)' }}>{d.dag_id}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{d.last_run}</td>
                <td style={{ color: 'var(--text-secondary)' }}>in {d.next_run}</td>
                <td><span className="badge badge-green">● success</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
