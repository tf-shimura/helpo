import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AskPage from './pages/AskPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AskPage />
  </StrictMode>,
)
