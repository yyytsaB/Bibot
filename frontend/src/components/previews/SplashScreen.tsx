import mascot from '../../assets/bibot/duck-welcome.png'
import wordmark from '../../assets/bibot/wordmark.png'
import '../../styles/splash.css'

/** Screen 1 design preview. The bar is a manual advance, not a readiness signal. */
export function SplashScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="bibot-splash" aria-label="Welcome to Bibot">
      <svg className="splash-background" viewBox="0 0 390 812" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="splash-top-lavender" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e7ddfc" />
            <stop offset="1" stopColor="#eee8fc" />
          </linearGradient>
          <linearGradient id="splash-bottom-lavender" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e3d9fa" />
            <stop offset="1" stopColor="#ded3f9" />
          </linearGradient>
        </defs>
        <path fill="url(#splash-top-lavender)" d="M0 0H171C161 40 148 64 110 76C93 81 78 82 64 96C48 112 49 137 25 149C18 153 9 156 0 158Z" />
        <path fill="url(#splash-bottom-lavender)" d="M390 655C362 665 358 692 329 696C303 700 297 692 268 702C212 719 169 757 157 812H390Z" />
        <circle cx="325" cy="660" r="14" fill="#e0d4fa" />
      </svg>
      <svg className="splash-wordmark" viewBox="405 161 1385 411" preserveAspectRatio="none" role="img" aria-label="Bibot">
        <image href={wordmark} width="2172" height="724" />
      </svg>
      <div className="splash-ground-shadow" aria-hidden="true" />
      <svg className="splash-mascot" viewBox="354 246 1346 1054" preserveAspectRatio="none" role="img" aria-label="Bibot duck waving, surrounded by purple and yellow stars">
        <image href={mascot} width="2000" height="1500" />
      </svg>
      <button className="splash-next" type="button" onClick={onContinue} aria-label="Continue to Home" title="Continue to Home">
        <span className="splash-track" aria-hidden="true"><span className="splash-fill" /></span>
      </button>
    </section>
  )
}
