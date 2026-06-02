import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const GRADIENTS = {
  blue:   'linear-gradient(135deg,#3b82f6,#60a5fa)',
  purple: 'linear-gradient(135deg,#8b5cf6,#a78bfa)',
  green:  'linear-gradient(135deg,#10b981,#34d399)',
  orange: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
  red:    'linear-gradient(135deg,#ef4444,#f87171)',
  cyan:   'linear-gradient(135deg,#06b6d4,#22d3ee)',
}

const ICON_BG = {
  blue:   'rgba(59,130,246,0.12)',
  purple: 'rgba(139,92,246,0.12)',
  green:  'rgba(16,185,129,0.12)',
  orange: 'rgba(245,158,11,0.12)',
  red:    'rgba(239,68,68,0.12)',
  cyan:   'rgba(6,182,212,0.12)',
}

export default function KPICard({ icon: Icon, label, value, change, changeLabel, color = 'blue', prefix = '', suffix = '' }) {
  const isPositive = change > 0
  const isNeutral  = change === 0 || change == null

  return (
    <div
      className="kpi-card animate-fade-in-up"
      style={{
        '--kpi-gradient': GRADIENTS[color],
        '--kpi-icon-bg':  ICON_BG[color],
      }}
    >
      <div className="kpi-icon">
        <Icon size={20} color={GRADIENTS[color].includes('3b82f6') ? '#3b82f6' : GRADIENTS[color].includes('8b5cf6') ? '#8b5cf6' : GRADIENTS[color].includes('10b981') ? '#10b981' : GRADIENTS[color].includes('f59e0b') ? '#f59e0b' : GRADIENTS[color].includes('ef4444') ? '#ef4444' : '#06b6d4'} />
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{prefix}{value}{suffix}</div>
      {changeLabel && (
        <div className={`kpi-change ${isNeutral ? 'neutral' : isPositive ? 'up' : 'down'}`}>
          {isNeutral ? <Minus size={12} /> : isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {changeLabel}
        </div>
      )}
    </div>
  )
}
