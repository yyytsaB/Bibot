export type SetSummaryIconKind = 'name' | 'subject' | 'questions' | 'type' | 'difficulty'

export function SetSummaryIcon({ kind }: { kind: SetSummaryIconKind }) {
  const color = kind === 'name' ? '#18ce9a' : kind === 'difficulty' ? '#ffa426' : '#456aff'
  return <span className={`ready-summary-icon ${kind}`}><svg viewBox="0 0 28 28" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'name' && <><circle cx="14" cy="14" r="9" fill={color} stroke="none" /><path d="m10 14 3 3 5-6" stroke="white" strokeWidth="2.3" /></>}
    {kind === 'subject' && <><rect x="6" y="6" width="16" height="12" rx="2" /><path d="M11 10v4M16 10v4M14 19v3M9 22h10" /></>}
    {kind === 'questions' && <><circle cx="14" cy="14" r="9" /><path d="m12 10 5 4-5 4Z" fill={color} strokeWidth="1" /></>}
    {kind === 'type' && <><path d="M9 5h9l5 5v13H9Z" /><path d="M17 5v6h6M5 9v14h10M13 15h6M13 19h4" /></>}
    {kind === 'difficulty' && <><path d="M14 5v18M6 9l16 10M6 19 22 9M9 5l5 4 5-4M9 23l5-4 5 4" /></>}
  </svg></span>
}
