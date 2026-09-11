interface Props {
  subtitle?: string;
}

export default function Header({
  subtitle = 'Swatch and collect colors through the camera.',
}: Props) {
  return (
    <header className="header">
      <h1 className="text-heading-4" style={{ color: 'var(--dark-blue)', margin: 0 }}>
        Lens swatch
      </h1>
      <p className="text-label-1" style={{ color: 'var(--text-secondary)', marginTop: 16 }}>
        {subtitle}
      </p>
    </header>
  );
}
