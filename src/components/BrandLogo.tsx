export function BrandMark({
  size = 28,
  pulsing = false,
  className = '',
}: {
  size?: number;
  pulsing?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={`vr-brand-mark${pulsing ? ' is-pulsing' : ''}${className ? ` ${className}` : ''}`}
    >
      <circle cx="18" cy="18" r="18" fill="var(--vr-accent-brand)" />
      <circle cx="10.5" cy="18" r="1.5" fill="#FFFFFF" />
      <rect x="14.2" y="13.5" width="2.4" height="9" rx="1.2" fill="#FFFFFF" />
      <circle cx="19.5" cy="18" r="1.5" fill="#FFFFFF" className="vr-mark-node" />
      <rect x="23" y="11.5" width="2.4" height="13" rx="1.2" fill="#FFFFFF" />
    </svg>
  );
}

export function BrandWordmark({
  size = 28,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`vr-wordmark${className ? ` ${className}` : ''}`}>
      <BrandMark size={size} />
      <span className="vr-wordmark-text">VOXRELAY</span>
    </span>
  );
}
