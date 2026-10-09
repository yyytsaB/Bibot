export type IconName = 'home' | 'practice' | 'map' | 'book' | 'upload' | 'text' | 'back' | 'arrow' | 'search' | 'user' | 'play' | 'math' | 'screen' | 'chat'

const paths: Record<IconName, string> = {
  home: 'M3 11 12 3l9 8v10h-6v-7H9v7H3Z',
  practice: 'M6 3h9l4 4v14H6Z M14 3v5h5 M9 12h7 M9 16h7',
  map: 'M12 7v5 M7 17l5-5 5 5 M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  book: 'M12 5v16 M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z',
  upload: 'M6 3h9l4 4v14H6Z M14 3v5h5 M9 14h7 M12 11l-3 3 3 3',
  text: 'M4 4h16v14H9l-5 3Z M8 8h8 M8 12h6',
  back: 'M15 5l-7 7 7 7 M8 12h12',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M4 21c0-10 16-10 16 0',
  play: 'M8 4l12 8-12 8Z',
  math: 'M5 3h14l-7 9 7 9H5l7-9Z',
  screen: 'M3 4h18v13H3Z M12 17v4 M7 21h10',
  chat: 'M12 3C0 3 0 18 9 19l-3 3 8-3C24 18 24 3 12 3Z',
}

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
