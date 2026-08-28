import type { FeedbackValue } from '../ports'

export type HistorySource = Readonly<{ faqId: string; question: string; quote: string }>

export type HistoryFeedback = Readonly<{
  id: string
  answerId: string
  value: FeedbackValue
  createdAt: Date
}>

export type CompleteHistoryItem = Readonly<{
  outcome: 'COMPLETE'
  id: string
  askedAt: Date
  question: string
  answer: string
  sources: readonly HistorySource[]
  feedback: HistoryFeedback | null
}>

export type UnanswerableHistoryItem = Readonly<{
  outcome: 'UNANSWERABLE'
  id: string
  askedAt: Date
  question: string
  reason: string
  message: string
  sources: readonly []
  feedback: null
}>

export type HistoryItem = CompleteHistoryItem | UnanswerableHistoryItem
