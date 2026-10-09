import { Icon } from '../layout/Icon'
import duck from '../../assets/bibot/duck-reading-stars.png'
import '../../styles/generating-preview.css'

export function GeneratingPreview({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return <section className="generation-page">
    <button className="icon-button generation-back" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button>
    <div className="generation-composition">
      <h1>Generating<br />Your Practice Set...</h1>
      <p className="generation-description">This may take a moment.<br />We’re creating questions based<br />on your material.</p>
      <svg className="generation-duck" viewBox="414 191 1149 1090" role="img" aria-label="Bibot duck with purple glasses reading a book, surrounded by stars"><image href={duck} width="2000" height="1500" /></svg>
      <button className="generation-progress-preview" type="button" onClick={onContinue} aria-label="View ready-screen preview; progress is illustrative" title="Static progress illustration — view the ready-screen preview"><span className="generation-progress-track" aria-hidden="true"><span /></span></button>
      <p className="generation-caption">Analyzing your material...</p>
    </div>
  </section>
}
