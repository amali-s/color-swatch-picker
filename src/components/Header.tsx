interface Props {
  subtitle?: string;
  className?: string;
}

export default function Header({
  subtitle = 'Swatch and collect colors through the camera.',
  className,
}: Props) {
  return (
    <header className={['header', className].filter(Boolean).join(' ')}>
      <h1 className="text-heading-4" style={{ color: 'var(--dark-blue)', margin: 0 }}>
        Lens swatch
      </h1>
      <p className="text-label-1" style={{ color: 'var(--text-secondary)' }}>
        {subtitle}
      </p>
    </header>
  );
}
