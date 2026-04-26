import type { ReactNode } from 'react'

interface Props {
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

export const IconButton = ({ title, onClick, disabled = false, children }: Props) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    disabled={disabled}
    className="icon-button"
  >
    {children}
  </button>
)
