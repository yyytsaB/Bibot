export type PracticeTypeIconKind = 'definition' | 'scenario' | 'mixed'

export function PracticeTypeIcon({ kind }: { kind: PracticeTypeIconKind }) {
  const purple = kind === 'mixed'
  return <svg className="set-type-art" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={`set-type-${kind}`} x1="8" y1="5" x2="41" y2="43" gradientUnits="userSpaceOnUse"><stop stopColor={purple ? '#aa7cff' : '#61a5ff'} /><stop offset="1" stopColor={purple ? '#723aff' : '#075bff'} /></linearGradient></defs>
    <g stroke={`url(#set-type-${kind})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'definition' && <><path d="M12 5h20l9 10v27H12a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" fill="#e9f2ff" /><path d="M31 6v10h9M18 22h14M20 29h9M24 26v8M21 31l3 3 3-3" /><path d="m36 37 5 5" /></>}
      {kind === 'scenario' && <><path d="M23 8C10 8 5 17 8 28l-2 9 10-3c6 3 15 2 20-4" fill="#e9f4ff" /><path d="M25 5v18M19 11l6-6 6 6M37 24v10l6 3M36 34h7" /><path d="M13 38h12" strokeWidth="2.5" /></>}
      {kind === 'mixed' && <><path d="M22 7c-6-3-12 1-12 6-7 2-7 11-3 14-2 7 4 11 9 10 2 6 9 5 11 1 7 2 12-3 10-9 5-4 4-12-2-14 0-6-8-9-13-8Z" fill="#eadfff" /><path d="M23 8v8l-5 5v9M14 14l4 3M7 25l7-1M14 34l4-4M30 17l-3 6 6 3M27 38v-7M38 29l-5-3" strokeWidth="2.8" /></>}
    </g>
  </svg>
}
