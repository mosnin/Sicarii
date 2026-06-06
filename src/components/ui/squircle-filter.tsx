// Static SVG goo filters that smooth rectangular corners into squircles.
// Mounted once in the root layout so the filters are available on every
// surface (logged-in dashboard and logged-out marketing). Pure CSS/SVG, no
// re-renders: point an element at one with style={{ filter: "url(#squircle)" }}.
//
// The matrix value is the alpha multiplier - higher means crisper edges with
// only the corners smoothed. We keep it between 40 and 50 depending on how
// large the element is (bigger surfaces read better a touch softer).
//
// See squircle.md for the full write-up and the original source.

type GooFilter = {
  id: string;
  // alpha multiplier (40-50): higher = tighter, crisper squircle corners
  matrix: number;
  // gaussian spread that feeds the corner rounding
  blur: number;
  // alpha offset
  alpha: number;
};

const FILTERS: GooFilter[] = [
  { id: "squircle", matrix: 45, blur: 8, alpha: -7 }, // default: cards, panels
  { id: "squircle-soft", matrix: 40, blur: 10, alpha: -7 }, // large surfaces
  { id: "squircle-tight", matrix: 50, blur: 6, alpha: -7 }, // small chips
];

export function SquircleFilters() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute h-0 w-0"
      aria-hidden
      focusable={false}
      version="1.1"
    >
      <defs>
        {FILTERS.map(({ id, matrix, blur, alpha }) => (
          <filter key={id} id={id}>
            <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${matrix} ${alpha}`}
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
