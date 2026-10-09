export type LibrarySetIconKind = 'foundations' | 'reasoning' | 'fallacies' | 'scenarios' | 'notes' | 'article'

export function LibrarySetIcon({ kind }: { kind: LibrarySetIconKind }) {
  const colors = { foundations: '#12d09a', reasoning: '#1689ff', fallacies: '#873bff', scenarios: '#fc4095', notes: '#354cff', article: '#ff742c' }
  const color = colors[kind]
  return <svg className="library-set-art" viewBox="0 0 48 48" fill="none" aria-hidden="true"><g stroke={color} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'foundations' && <><rect x="9" y="8" width="30" height="26" rx="4" fill="#73f0cc" /><path d="M15 12v17M23 14v5M28 14v5M24 35v6M17 41h14" /></>}
    {kind === 'reasoning' && <><rect x="7" y="7" width="34" height="27" rx="3" fill="#b2ddff" /><path d="M12 12h24v16H12Z" fill="#e7f3ff" strokeWidth="2" /><path d="M24 34v7M13 41h22" /></>}
    {kind === 'fallacies' && <path d="M36 8H12l14 16-14 16h24" strokeWidth="5" />}
    {kind === 'scenarios' && <><path d="M22 8c-5-4-12 0-12 5-7 1-8 11-3 14-2 7 4 12 9 10 2 6 9 6 12 1 7 2 12-4 10-10 5-4 4-12-2-14-1-6-9-9-14-6Z" fill="#ffe4f1" /><path d="M22 9v28" strokeWidth="2" /></>}
    {(kind === 'notes' || kind === 'article') && <><path d="M12 5h19l10 11v26H12a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" fill={kind === 'notes' ? '#eef0ff' : '#fff1e9'} /><path d="M30 5v12h11M17 23h15M17 29h15M17 35h10" strokeWidth="3" /></>}
  </g></svg>
}
