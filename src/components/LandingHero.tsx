import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './LandingHero.module.css';

const WORDS = ['languages.', 'idiomas.', 'langues.', 'Sprachen.', 'lingue.', 'línguas.'];

// Outlined U+201C/U+201D from Instrument Serif regular (Google Fonts v5,
// OFL-1.1). 44px glyphs positioned at the reference baselines (0,31)/(17,31).
const QUOTES = ["M1.672 6.272Q0.572 6.272 -0.066 5.48Q-0.704 4.688 -0.704 3.324Q-0.704 1.3 0.198 -0.372Q1.1 -2.044 3.124 -3.496Q3.652 -3.892 3.96 -3.672Q4.136 -3.54 4.136 -3.298Q4.136 -3.056 3.828 -2.836Q2.332 -1.56 1.914 -0.878Q1.496 -0.196 1.496 0.552Q1.496 1.344 1.848 1.762Q2.2 2.18 2.64 2.466Q3.08 2.752 3.432 3.148Q3.784 3.544 3.784 4.336Q3.784 5.128 3.234 5.7Q2.684 6.272 1.672 6.272ZM8.272 6.272Q7.172 6.272 6.534 5.48Q5.896 4.688 5.896 3.324Q5.896 1.3 6.798 -0.372Q7.7 -2.044 9.724 -3.496Q10.252 -3.892 10.56 -3.672Q10.736 -3.54 10.736 -3.298Q10.736 -3.056 10.428 -2.836Q8.932 -1.56 8.514 -0.878Q8.096 -0.196 8.096 0.552Q8.096 1.344 8.448 1.762Q8.8 2.18 9.24 2.466Q9.68 2.752 10.032 3.148Q10.384 3.544 10.384 4.336Q10.384 5.128 9.834 5.7Q9.284 6.272 8.272 6.272Z", "M19.42 8.648Q18.892 9.044 18.584 8.824Q18.408 8.692 18.408 8.45Q18.408 8.208 18.716 7.988Q20.212 6.712 20.63 5.942Q21.048 5.172 21.048 4.6Q21.048 3.808 20.696 3.39Q20.344 2.972 19.904 2.686Q19.464 2.4 19.112 2.004Q18.76 1.608 18.76 0.816Q18.76 0.024 19.332 -0.548Q19.904 -1.12 20.872 -1.12Q21.972 -1.12 22.61 -0.328Q23.248 0.464 23.248 1.828Q23.248 3.852 22.368 5.524Q21.488 7.196 19.42 8.648ZM26.02 8.648Q25.492 9.044 25.184 8.824Q25.008 8.692 25.008 8.45Q25.008 8.208 25.316 7.988Q26.812 6.712 27.23 5.942Q27.648 5.172 27.648 4.6Q27.648 3.808 27.296 3.39Q26.944 2.972 26.504 2.686Q26.064 2.4 25.712 2.004Q25.36 1.608 25.36 0.816Q25.36 0.024 25.932 -0.548Q26.504 -1.12 27.472 -1.12Q28.572 -1.12 29.21 -0.328Q29.848 0.464 29.848 1.828Q29.848 3.852 28.968 5.524Q28.088 7.196 26.02 8.648Z"];

export function LandingHero() {
  const cycleRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const words = Array.from(cycleRef.current?.children || []);
    let timer: ReturnType<typeof setInterval> | undefined;
    let index = 0;
    function reset() {
      clearInterval(timer);
      index = 0;
      words.forEach((word, i) => {
        word.classList.remove(styles.isOut);
        word.classList.toggle(styles.isOn, i === 0);
      });
      if (media.matches) return;
      timer = setInterval(() => {
        const previous = words[index];
        index = (index + 1) % words.length;
        words.forEach((word) => word.classList.remove(styles.isOut));
        previous.classList.remove(styles.isOn);
        previous.classList.add(styles.isOut);
        words[index].classList.add(styles.isOn);
      }, 2400);
    }
    reset();
    media.addEventListener('change', reset);
    return () => { clearInterval(timer); media.removeEventListener('change', reset); };
  }, []);

  return (
    <section className={styles.hero} lang="en" dir="ltr" aria-label="VoxRelay">
      <nav className={styles.nav} aria-label="Main navigation">
        <Link to="/" className={styles.logo} aria-label="VoxRelay home">
          <svg width="34" height="16" viewBox="0 0 34 16" aria-hidden="true">
            <g className={styles.quoteLeft}><path className={styles.qL} d={QUOTES[0]} fill="#1B3A33" /></g>
            <g className={styles.quoteRight}><path className={styles.qR} d={QUOTES[1]} fill="#C4421A" /></g>
          </svg>
          <span className={styles.logoWord}>Vox<i>Relay</i></span>
        </Link>
        <div className={styles.navLinks}>
          <Link to="/how-it-works" className={styles.ulink}>How it works</Link>
          <Link to="/organizations" className={styles.ulink}>For organizations</Link>
          <Link to="/login" className={`${styles.ulink} ${styles.signin}`}>Sign in</Link>
        </div>
      </nav>
      <div className={styles.content}>
        <div className={`${styles.eyebrow} ${styles.r1}`}>HUMAN-LED · NEVER AI-REPLACED</div>
        <h1 className={styles.heading}>
          <span className={`${styles.line} ${styles.r2}`}>Infrastructure for the <span className={styles.humans}>humans<svg viewBox="0 0 250 16" preserveAspectRatio="none" aria-hidden="true"><path className={styles.underline} d="M4 11 C 70 4, 160 3, 246 8" stroke="#F2B732" strokeWidth="4" fill="none" strokeLinecap="round" /></svg></span></span>{' '}
          <span className={`${styles.line} ${styles.r3}`}>between <span className={styles.srOnly}>languages.</span><span ref={cycleRef} className={styles.cycle} aria-hidden="true">{WORDS.map((word, i) => <span key={word} className={i === 0 ? styles.isOn : undefined}>{word}</span>)}</span></span>
        </h1>
        <p className={`${styles.sub} ${styles.r4}`}>Assignments, preparation, terminology and real human support for professional remote interpreters.</p>
        <div className={`${styles.ctas} ${styles.r5}`}>
          <Link to="/login?mode=signup" className={`${styles.btn} ${styles.btnPrimary}`}>Create your workspace <span className={styles.arr} aria-hidden="true">↗</span></Link>
          <Link to="/contact?audience=organization" className={`${styles.btn} ${styles.btnSecondary}`}>Request organization access</Link>
        </div>
      </div>
    </section>
  );
}
