import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export const fetchPlatformStats   = () => api.get('/api/platform/stats').then(r => r.data)
export const fetchAgents          = () => api.get('/api/agents').then(r => r.data)
export const fetchAgentMetrics    = (id, days = 7) => api.get(`/api/agents/${id}/metrics?days=${days}`).then(r => r.data)
export const fetchRealtimeMetrics = (agentId) => api.get(`/api/metrics/realtime${agentId ? `?agent_id=${agentId}` : ''}`).then(r => r.data)
export const fetchHallucinationMetrics = (days = 7) => api.get(`/api/metrics/hallucination?days=${days}`).then(r => r.data)
export const fetchCostForecasts   = (agentId, days = 7) => api.get(`/api/forecasts/cost?days=${days}${agentId ? `&agent_id=${agentId}` : ''}`).then(r => r.data)
export const fetchPipelineStatus  = () => api.get('/api/platform/pipeline-status').then(r => r.data)

export const predictHallucination = (payload) => api.post('/api/predict/hallucination', payload).then(r => r.data)
export const predictFailure       = (payload) => api.post('/api/predict/failure', payload).then(r => r.data)

export default api
