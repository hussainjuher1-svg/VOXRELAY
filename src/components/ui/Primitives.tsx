import type { ReactNode } from 'react';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'sage' | 'amber' | 'danger' | 'teal' | 'success' | 'warning' | 'accent';
  children: ReactNode;
}) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  body,
  description,
  icon,
  action,
  illustration,
}: {
  title: string;
  body?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
}) {
  const copy = body || description || '';
  return (
    <div className="ui-empty-state">
      {illustration ? (
        <div className="ui-empty-illustration">{illustration}</div>
      ) : icon ? (
        <div className="ui-empty-icon">{icon}</div>
      ) : null}
      <h3>{title}</h3>
      {copy && <p>{copy}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = '18px',
}: {
  width?: number | string;
  height?: number | string;
}) {
  return (
    <span
      className="ui-skeleton"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
