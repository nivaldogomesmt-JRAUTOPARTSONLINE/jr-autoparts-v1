import { memo } from 'react';

function PaginationControls({ page = 1, pages = 1, onChange, loading = false }) {
  if (!pages || pages <= 1) return null;

  const safePage = Math.max(1, page);
  const safePages = Math.max(1, pages);
  const windowStart = Math.max(1, safePage - 2);
  const windowEnd = Math.min(safePages, windowStart + 4);
  const numbers = [];

  for (let current = windowStart; current <= windowEnd; current += 1) {
    numbers.push(current);
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
      <div className="text-sm text-muted">Pagina {safePage} de {safePages}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange?.(safePage - 1)} disabled={loading || safePage <= 1}>
          Anterior
        </button>
        {numbers.map((item) => (
          <button
            key={item}
            type="button"
            className={`btn btn-sm ${item === safePage ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onChange?.(item)}
            disabled={loading}
          >
            {item}
          </button>
        ))}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange?.(safePage + 1)} disabled={loading || safePage >= safePages}>
          Proxima
        </button>
      </div>
    </div>
  );
}

export default memo(PaginationControls);
