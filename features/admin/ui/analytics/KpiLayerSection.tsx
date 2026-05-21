interface KpiLayerSectionProps {
  layer: string;
  description?: string;
  children: React.ReactNode;
}

export default function KpiLayerSection({ layer, description, children }: KpiLayerSectionProps) {
  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-2">
        <h2 className="font-serif text-lg font-semibold text-text-primary">{layer}</h2>
        {description && <p className="text-xs text-text-muted">{description}</p>}
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}
