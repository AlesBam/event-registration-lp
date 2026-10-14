type Props = { className?: string; title?: string };

/**
 * Logo: badmintonový míček, jehož korunka z peří tvoří jemnou vločku.
 * Čisté SVG bez závislostí, škáluje se a sdílí tvar s OG obrázkem.
 */
export function Logo({ className, title }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* korunka z peří */}
      <path d="M24 42 L12 8 H52 L40 42 Z" fill="#ffffff" fillOpacity="0.14" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M28 42 L22 8 M32 42 V8 M36 42 L42 8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 22 H47" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      {/* vločka na vrcholu */}
      <g stroke="#e8bb4f" strokeWidth="2" strokeLinecap="round">
        <path d="M32 2 V14 M26.8 5 L37.2 11 M26.8 11 L37.2 5" />
      </g>
      {/* hlavička míčku */}
      <path d="M22 42 H42 V46 A10 10 0 0 1 22 46 Z" fill="#e8bb4f" />
    </svg>
  );
}
