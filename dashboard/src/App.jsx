import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Overview from './pages/Overview.jsx'
import AgentAnalytics from './pages/AgentAnalytics.jsx'
import MLHub from './pages/MLHub.jsx'
import CostForecast from './pages/CostForecast.jsx'
import PipelineStatus from './pages/PipelineStatus.jsx'
import QualityScores from './pages/QualityScores.jsx'
import Realtime from './pages/Realtime.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"         element={<Overview />} />
            <Route path="/realtime" element={<Realtime />} />
            <Route path="/agents"   element={<AgentAnalytics />} />
            <Route path="/quality"  element={<QualityScores />} />
            <Route path="/mlhub"    element={<MLHub />} />
            <Route path="/forecast" element={<CostForecast />} />
            <Route path="/pipeline" element={<PipelineStatus />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
