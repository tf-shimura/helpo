import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MockApp } from './MockApp'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MockApp requestedScreen="login" role={null} />
  </StrictMode>,
)
