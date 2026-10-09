import { Icon } from '../layout/Icon'
import '../../styles/upload-file.css'

export function UploadFilePreview({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return <section className="upload-page">
    <button className="icon-button upload-back" type="button" onClick={onBack} aria-label="Go back"><Icon name="back" /></button>
    <h1>Upload File</h1>
    <button className="upload-panel" type="button" disabled aria-label="Uploads unavailable — design preview only" title="Uploads unavailable — design preview only">
      <svg className="upload-document" viewBox="0 0 64 72" fill="none" aria-hidden="true">
        <defs><linearGradient id="upload-document-purple" x1="10" y1="5" x2="52" y2="66" gradientUnits="userSpaceOnUse"><stop stopColor="#b28aff" /><stop offset="1" stopColor="#8752ff" /></linearGradient></defs>
        <g stroke="url(#upload-document-purple)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 7h25l14 15v39a5 5 0 0 1-5 5H14a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5Z" fill="#faf7ff" /><path d="M38 8v15h14M23 39h17M28 47h7" /></g>
      </svg>
      <strong>Tap to upload a file</strong>
      <span className="upload-formats">PDF, DOCX, TXT (Max 10 MB)</span>
      <span className="upload-drag">or drag and drop</span>
    </button>
    <div className="upload-sample" aria-label="Sample file illustration only — no file selected or processed">
      <svg className="upload-pdf" viewBox="0 0 40 50" fill="none" aria-hidden="true"><defs><linearGradient id="upload-pdf-red" x1="0" y1="0" x2="40" y2="50" gradientUnits="userSpaceOnUse"><stop stopColor="#ff4d67" /><stop offset="1" stopColor="#ff173e" /></linearGradient></defs><path d="M5 2h20l12 12v31a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z" fill="url(#upload-pdf-red)" /><path d="M25 2v12h12" fill="#ff8a9b" /><text x="8" y="36" fill="white" fontFamily="Nunito, sans-serif" fontSize="12" fontWeight="900">PDF</text></svg>
      <span className="upload-file-details"><strong>AI_Notes_Ch1-3.pdf</strong><small>2.4 MB</small></span>
      <span className="upload-sample-close" aria-hidden="true">×</span>
    </div>
    <button className="primary-button upload-continue" type="button" onClick={onContinue}>Continue <Icon name="arrow" /></button>
  </section>
}
