export type SubjectIconKind = 'thinking' | 'logic' | 'research' | 'math' | 'computer' | 'communication'

export function SubjectIcon({ kind }: { kind: SubjectIconKind }) {
  const colors = { thinking: ['#647cff', '#174cff'], logic: ['#3be4b6', '#08bc90'], research: ['#ffad38', '#ff7412'], math: ['#ff70b9', '#ed3598'], computer: ['#389dff', '#0069ed'], communication: ['#a17bff', '#682aff'] }
  const [light, dark] = colors[kind]
  return <svg className="subject-art" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs><linearGradient id={`subject-art-${kind}`} x1="6" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor={light} /><stop offset="1" stopColor={dark} /></linearGradient></defs>
    <g stroke={`url(#subject-art-${kind})`} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'thinking' && <><path d="m21 13-10 20m16-20 10 20M15 35h18" /><circle cx="24" cy="10" r="5" fill="#a9baff" /><circle cx="10" cy="36" r="5" fill="#a9baff" /><circle cx="38" cy="36" r="5" fill="#a9baff" /></>}
      {kind === 'logic' && <><rect x="7" y="7" width="33" height="27" rx="4" fill="#7af1d5" /><path d="M13 10v19M20 13v5M25 13v5M19 35v6M13 42h15M33 30v12l7-5" /><path d="M18 31h15" strokeWidth="2" /></>}
      {kind === 'research' && <><path d="M12 6h20l8 9v26H12a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" fill="#fff8e9" /><path d="M31 6v10h9M17 23h10M17 29h7M29 24l-3 9h6l-3 9" /></>}
      {kind === 'math' && <><path d="M36 8H12l14 16-14 16h24" strokeWidth="5" /><path d="M14 9v5M35 35v5" strokeWidth="3" /></>}
      {kind === 'computer' && <><rect x="7" y="7" width="34" height="26" rx="3" fill="#add7ff" /><path d="M11 12h26v16H11Z" fill="#e8f5ff" strokeWidth="2" /><path d="M23 34v7M14 41h20M8 37h8" /></>}
      {kind === 'communication' && <><path d="M40 22c0 10-9 16-20 14L9 41l2-11C3 18 10 8 23 8c10 0 17 6 17 14Z" fill="#e9dfff" /><path d="M10 32 7 37" strokeWidth="2" /></>}
    </g>
  </svg>
}
