import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Bot, Brain, TrendingUp,
  GitBranch, Activity, Zap, ExternalLink
} from 'lucide-react'

const NAV = [
  {
    section: 'Overview',
    items: [
      { to: '/',         icon: LayoutDashboard, label: 'Executive Overview' },
      { to: '/realtime', icon: Activity,         label: 'Realtime Stream' },
    ],
  },
  {
    section: 'Agents',
    items: [
      { to: '/agents',   icon: Bot,        label: 'Agent Analytics' },
      { to: '/quality',  icon: TrendingUp, label: 'Quality Scores' },
    ],
  },
  {
    section: 'AI & ML',
    items: [
      { to: '/mlhub',    icon: Brain,     label: 'ML Inference Hub' },
      { to: '/forecast', icon: Zap,       label: 'Cost Forecasts' },
    ],
  },
  {
    section: 'Platform',
    items: [
      { to: '/pipeline', icon: GitBranch, label: 'Pipeline Status' },
    ],
  },
]

const EXTERNAL = [
  { href: 'http://localhost:5000', label: 'MLflow UI', color: '#3b82f6' },
  { href: 'http://localhost:8088', label: 'Airflow UI', color: '#10b981' },
  { href: 'http://localhost:9001', label: 'MinIO UI',   color: '#f59e0b' },
  { href: 'http://localhost:8000/docs', label: 'API Docs', color: '#8b5cf6' },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 900,
          }}>⚡</div>
          <div>
            <div className="sidebar-logo-title">AgentOps</div>
            <div className="sidebar-logo-subtitle">AI Observability Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV.map(group => (
          <div key={group.section}>
            <div className="nav-section-label">{group.section}</div>
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon className="nav-icon" size={18} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}

        {/* External Links */}
        <div>
          <div className="nav-section-label">External Tools</div>
          {EXTERNAL.map(({ href, label, color }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-item"
              style={{ '--agent-color': color }}
            >
              <ExternalLink size={14} />
              <span style={{ fontSize: '0.82rem' }}>{label}</span>
            </a>
          ))}
        </div>
      </nav>

      {/* Footer Status */}
      <div className="sidebar-footer">
        <div className="status-pill">
          <div className="status-dot" />
          All Systems Operational
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 10, textAlign: 'center' }}>
          v1.0.0 · AgentOps Platform
        </div>
      </div>
    </aside>
  )
}
