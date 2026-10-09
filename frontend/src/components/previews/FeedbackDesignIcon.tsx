export function FeedbackDesignIcon({ kind }: { kind: 'bulb' | 'book' | 'target' }) {
  return <svg className={`feedback-design-icon ${kind}`} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={`feedback-design-${kind}`} x1="8" y1="3" x2="40" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor={kind === 'bulb' ? '#ffe765' : kind === 'book' ? '#b38bff' : '#ff9870'} /><stop offset="1" stopColor={kind === 'bulb' ? '#ffb800' : kind === 'book' ? '#7035f7' : '#ff512f'} /></linearGradient></defs>
    <g stroke={`url(#feedback-design-${kind})`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'bulb' && <><path d="M24 9c-12 0-15 13-8 21 2 2 3 5 3 7h10c0-2 1-5 3-7 7-8 4-21-8-21Z" fill="url(#feedback-design-bulb)" /><path d="M21 40h6M23 44h2M24 2v3M8 8l3 3M3 22h5M40 8l-3 3M45 22h-5" strokeWidth="2.8" /></>}
      {kind === 'book' && <><path d="M24 10C17 5 9 6 5 8v29c6-2 13-1 19 3 6-4 13-5 19-3V8c-4-2-12-3-19 2Z" fill="#f9f3ff" /><path d="M24 10v30M11 13h7M11 19h7M30 13h7M30 19h7" strokeWidth="2.8" /></>}
      {kind === 'target' && <><circle cx="23" cy="26" r="16" fill="#fff0e4" /><circle cx="23" cy="26" r="9" /><path d="m23 26 16-17M33 8l7-3v9Z" fill="#ff7650" /></>}
    </g>
  </svg>
}
