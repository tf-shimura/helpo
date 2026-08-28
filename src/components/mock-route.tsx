'use client'

import { useState } from 'react'
import { MockApp } from '../MockApp'
import { ManualClock } from '../shared/mock/manual-clock'
import { createMockStore } from '../shared/mock/mock-store'
import type { RequestedScreen } from '../shared/mock/screen-access'

export function MockRoute({ requestedScreen, role = 'employee' }: { requestedScreen: RequestedScreen; role?: 'employee' | 'admin' }) {
  const [store] = useState(() => createMockStore(new ManualClock()))

  return <MockApp requestedScreen={requestedScreen} role={role} store={store} />
}
