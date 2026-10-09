export function HomeEntryIcon({ kind }: { kind: 'upload' | 'text' | 'book' }) {
  const isBook = kind === 'book'
  return <svg className="home-entry-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={`home-icon-${kind}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={isBook ? '#ffbf08' : '#a579ff'} /><stop offset="1" stopColor={isBook ? '#f79700' : '#723bfb'} /></linearGradient></defs>
    <g stroke={`url(#home-icon-${kind})`} strokeWidth="4.3" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'upload' ? <><path d="M12 5h17l9 10v27H12a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" fill="#f6eeff" /><path d="M28 5v11h10M18 26h12M21 22l-4 4 4 4M20 34h9" /></> : kind === 'text' ? <><path d="M10 6h29v32H18l-9 5V9a3 3 0 0 1 1-3Z" fill="#f4edff" /><path d="M16 15h17M16 22h17M16 29h11" strokeWidth="3.1" /></> : <><path d="M24 9v32M24 9C18 4 9 5 5 7v31c6-3 14-2 19 3 5-5 13-6 19-3V7c-4-2-13-3-19 2Z" fill="#fff9e5" /></>}
    </g>
  </svg>
}
