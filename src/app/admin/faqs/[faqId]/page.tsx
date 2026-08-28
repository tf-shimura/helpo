'use client'

import { HelpoClient } from '../../../../components/client/helpo-client'

export default function AdminFaqEditRoute({ params }: { params: { faqId: string } }) {
  return <HelpoClient initialScreen="faq-admin" faqId={params.faqId} />
}
