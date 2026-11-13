// The site mark: an eye between code brackets, "see what the code does".
// Same drawing as src/app/icon.svg, but in the current text colour so it follows the theme.
export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 19 L7 32 L17 45" />
        <path d="M47 19 L57 32 L47 45" />
        <path d="M21 32 Q32 18 43 32 Q32 46 21 32 Z" />
      </g>
      <circle cx="32" cy="32" r="4.5" fill="#f59e0b" />
    </svg>
  );
}
