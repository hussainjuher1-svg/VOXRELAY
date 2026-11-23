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
      <rect width="36" height="36" rx="8" fill="var(--vr-accent-brand)" />
      <path
        d="M10.5 11.5C13.5 13.4 14.8 15.5 14.8 18C14.8 20.5 13.5 22.6 10.5 24.5"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M25.5 11.5C22.5 13.4 21.2 15.5 21.2 18C21.2 20.5 22.5 22.6 25.5 24.5"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M14.5 18H21.5"
        stroke="#F6D28B"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="2.5" fill="#FFFFFF" className="vr-mark-node" />
    </svg>
  );
}

export function BrandWordmark({
  size = 24,
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
