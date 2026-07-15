import type { ReactNode } from 'react'

interface ReactionCardProps {
  active: boolean
  subdued: boolean
  disabled?: boolean
  icon: JSX.Element
  title: string
  description: string
  children?: ReactNode
  onClick(): void
}

export function ReactionCard({
  active,
  subdued,
  disabled,
  icon,
  title,
  description,
  children,
  onClick
}: ReactionCardProps): JSX.Element {
  const className = [
    'reaction-card',
    active ? 'reaction-card-active' : '',
    subdued ? 'reaction-card-subdued' : '',
    disabled ? 'reaction-card-disabled' : ''
  ].filter(Boolean).join(' ')

  return (
    <article className={className}>
      <button className="reaction-card-button" type="button" disabled={disabled} onClick={onClick}>
        <span className="reaction-card-icon">{icon}</span>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </button>
      <div className="reaction-card-expansion">{active && children}</div>
    </article>
  )
}
