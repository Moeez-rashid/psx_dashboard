/**
 * Shariah-compliant marker: a small mosque (dome with a finial, on a base
 * with a door). Drawn in the same stroke style as the lucide icons so it sits
 * with them; lucide has no mosque glyph.
 */
export default function MosqueIcon({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1}
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}
      role="img" aria-label="Shariah-compliant">
      <title>Shariah-compliant (KMI All Share, per PSX)</title>
      <path d="M12 2.5v2.5" />
      <path d="M6 12.5a6 6 0 0 1 12 0" />
      <path d="M4 21v-8.5h16V21" />
      <path d="M10 21v-3.2a2 2 0 0 1 4 0V21" />
      <path d="M2.5 21h19" />
    </svg>
  );
}
