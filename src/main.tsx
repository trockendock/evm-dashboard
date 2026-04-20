import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './style.css'
import App from './App.jsx'
import AuthGate from './AuthGate'
import { KanbanRoutes } from './features/kanban/routes'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthGate>
        {({ onLogout }) => (
          <Routes>
            <Route path="/" element={<Navigate to="/portfolio" replace />} />
            <Route path="/portfolio" element={<App onLogout={onLogout} />} />
            <Route path="/project/:projectSlug" element={<App onLogout={onLogout} />} />
            <Route path="/project/:projectSlug/:tab" element={<App onLogout={onLogout} />} />
            <Route path="/kanban" element={<KanbanRoutes />} />
            <Route path="/kanban/*" element={<KanbanRoutes />} />
            <Route path="*" element={<Navigate to="/portfolio" replace />} />
          </Routes>
        )}
      </AuthGate>
    </BrowserRouter>
  </StrictMode>,
)
