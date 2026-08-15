interface Props {
  subtitle?: string;
}

export default function Header({ subtitle = 'Collect colors on site' }: Props) {
  return (
    <header className="header">
      <h1 className="text-heading-5" style={{ color: 'var(--dark-blue)', margin: 0 }}>
        Lens swatch
      </h1>
      <p className="text-body-2" style={{ color: 'var(--text-secondary)', marginTop: 16 }}>
        {subtitle}
      </p>
    </header>
  );
}
