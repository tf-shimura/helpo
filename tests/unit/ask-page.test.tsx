import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AskPage from '../../src/pages/AskPage'

describe('AskPage', () => {
  it('DOM上に質問入力と送信操作を表示する', () => {
    render(<AskPage />)

    expect(screen.getByRole('textbox', { name: '質問内容' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '質問する' })).toBeDisabled()
  })
})
