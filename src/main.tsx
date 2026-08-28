import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MockApp } from './MockApp'
import { ManualClock } from './shared/mock/manual-clock'
import { createMockStore } from './shared/mock/mock-store'
import './index.css'

const store = createMockStore(new ManualClock())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MockApp requestedScreen="login" store={store} />
  </StrictMode>,
)
