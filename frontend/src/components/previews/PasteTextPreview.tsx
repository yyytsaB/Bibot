import { useState } from 'react'
import { Icon } from '../layout/Icon'
import '../../styles/paste-text.css'

export function PasteTextPreview({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [text, setText] = useState('')
  return <section className="paste-page">
    <button className="icon-button paste-back" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button>
    <h1>Paste Your Text</h1>
    <div className="paste-input">
      <textarea aria-label="Your text" placeholder="Paste your notes, readings, or any text here..." maxLength={10000} value={text} onChange={e => setText(e.target.value)} />
      <span className="paste-counter" aria-hidden="true">{text.length}/10000</span>
    </div>
    <aside className="paste-tips" aria-labelledby="paste-tips-title">
      <div className="paste-tips-heading">
        <svg className="paste-tip-icon" viewBox="0 0 30 36" fill="none" aria-hidden="true">
          <defs><linearGradient id="paste-bulb-purple" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b084ff" /><stop offset="1" stopColor="#743cf8" /></linearGradient></defs>
          <g stroke="url(#paste-bulb-purple)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3"><path d="M9 21C1 11 8 5 15 5s14 6 6 16c-2 2-2 5-2 6h-8c0-1 0-4-2-6Z" fill="#fbf8ff" /><path d="M12 30h6M13 33h4M15 1v1M4 5l2 2M1 13h2M26 5l-2 2M29 13h-2" /></g>
        </svg>
        <h2 id="paste-tips-title">Tips</h2>
      </div>
      <ul>
        <li>You can paste lecture notes, articles, or any study material.</li>
        <li>Longer and clearer texts create better practice questions.</li>
        <li>For best results, focus on one topic at a time.</li>
      </ul>
    </aside>
    <button className="primary-button paste-continue" type="button" onClick={onContinue}>Continue <Icon name="arrow" /></button>
  </section>
}
