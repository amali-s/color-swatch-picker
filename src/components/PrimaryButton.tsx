import type { ButtonHTMLAttributes } from 'react';

export default function PrimaryButton({
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="text-heading-1"
      style={{
        background: 'var(--accent)',
        color: 'var(--on-accent)',
        borderRadius: 32,
        padding: '8px 12px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
