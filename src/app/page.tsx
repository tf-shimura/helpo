'use client'

import { useState } from 'react'
import { MockApp } from '../MockApp'
import { ManualClock } from '../shared/mock/manual-clock'
import { createMockStore } from '../shared/mock/mock-store'

export default function HomePage() {
  const [store] = useState(() => createMockStore(new ManualClock()))

  return <MockApp requestedScreen="login" store={store} />
}
