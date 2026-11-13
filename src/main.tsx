import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Headset,
  LockKeyhole,
  MessageCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import './index.css';

function ProductPreview() {
  return (
    <div className="preview-shell" aria-label="A preview of the VOXRELAY workspace">
      <div className="preview-topbar">
        <div className="preview-brand"><span className="brand-mark">V</span><span>VOXRELAY</span></div>
        <span className="preview-context">INTERPRETER WORKSPACE</span>
        <span className="preview-avatar" aria-hidden="true">I</span>
      </div>
      <div className="preview-body">
        <div className="preview-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h2>Work, in one place.</h2>
          </div>
          <span className="preview-date">Assignments <ChevronDown size={14} /></span>
        </div>
        <div className="preview-grid">
          <article className="preview-card calendar-card">
            <div className="preview-card-heading"><span className="mini-icon orange-icon"><CalendarDays size={16} /></span><span>Assignments</span><ArrowUpRight size={14} className="card-arrow" /></div>
            <div className="calendar-week" aria-label="Week view">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => <span className={i === 2 ? 'selected-day' : ''} key={`${day}-${i}`}>{day}</span>)}
            </div>
            <p className="card-caption">Calendar and assignment details</p>
          </article>
          <article className="preview-card prep-card">
            <div className="preview-card-heading"><span className="mini-icon green-icon"><ClipboardCheck size={16} /></span><span>Preparation</span><ArrowUpRight size={14} className="card-arrow" /></div>
            <div className="check-row"><span className="check-box"><Check size={11} /></span><span>Review assignment details</span></div>
            <div className="check-row"><span className="check-box empty-box" /><span>Check your setup</span></div>
          </article>
          <article className="preview-card terms-card">
            <div className="preview-card-heading"><span className="mini-icon blue-icon"><BookOpen size={16} /></span><span>Terminology</span><ArrowUpRight size={14} className="card-arrow" /></div>
            <div className="search-preview"><Search size={14} /><span>Search your terms</span><span className="search-key">⌘ K</span></div>
            <p className="card-caption">Your glossary, ready when you need it</p>
          </article>
          <article className="preview-card support-card">
            <div className="preview-card-heading"><span className="mini-icon rose-icon"><Headset size={16} /></span><span>Human support</span><ArrowUpRight size={14} className="card-arrow" /></div>
            <p className="support-copy">A person to help with operational questions.</p>
            <span className="support-link">Visit support <ArrowRight size={13} /></span>
          </article>
        </div>
        <div className="preview-footnote"><LockKeyhole size={12} /> No session recordings or transcripts</div>
      </div>
    </div>
  );
}

function AssistantDock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <section className="assistant-panel" aria-label="Workspace assistant">
        <div className="assistant-panel-top"><div><span className="assistant-spark"><Sparkles size={15} /></span><strong>Workspace assistant</strong></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={17} /></button></div>
        <p>Find your way around assignments, preparation, terminology, and support.</p>
        <div className="assistant-links">
          <a href="/login"><CalendarDays size={15} /> Go to assignments <ArrowUpRight size={13} /></a>
          <a href="/how-it-works"><BookOpen size={15} /> How the workspace works <ArrowUpRight size={13} /></a>
          <a href="/contact"><MessageCircle size={15} /> Contact the team <ArrowUpRight size={13} /></a>
        </div>
        <span className="assistant-note">This assistant helps you navigate the workspace. It does not interpret or translate.</span>
      </section>}
      <button className={`assistant-dock ${open ? 'dock-open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="assistant-panel">
        <span className="dock-icon">{open ? <X size={17} /> : <Sparkles size={17} />}</span>
        <span>Workspace assistant</span>
        {!open && <ArrowUpRight size={14} className="dock-arrow" />}
      </button>
    </>
  );
}

function LandingPage() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="VOXRELAY home"><span className="brand-mark">V</span><span>VOXRELAY</span></a>
        <nav className="header-utility" aria-label="Utility navigation">
          <a href="/login">Login</a>
          <a href="/contact">Request access</a>
          <a href="/contact">Contact</a>
          <a className="header-primary" href="/login">Open workspace <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <main>
        <section className="hero section-wrap">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="kicker-dot" /> A workspace for remote interpreters</div>
            <h1>Make room for the work <em>that matters.</em></h1>
            <p className="hero-description">A calmer way to manage assignments, prepare with confidence, keep terminology close, and reach human support.</p>
            <div className="hero-actions">
              <a className="button-primary" href="/login">Open workspace <ArrowUpRight size={17} /></a>
              <a className="button-secondary" href="/contact">Request access <ArrowRight size={16} /></a>
            </div>
            <p className="hero-footnote"><LockKeyhole size={13} /> Human-led workflows. No recording or transcription.</p>
          </div>
          <div className="hero-preview"><ProductPreview /></div>
        </section>

        <section className="trust-strip section-wrap" aria-label="What the workspace supports">
          <span className="strip-label">THE WORK, SUPPORTED</span>
          <div className="strip-items">
            <span>Assignments</span><i />
            <span>Preparation</span><i />
            <span>Terminology</span><i />
            <span>Support</span><i />
            <span className="human-led">Human-led workflows</span>
          </div>
        </section>

        <section className="how-section section-wrap" id="how-it-works">
          <div className="section-intro">
            <span className="eyebrow">A CLEARER WAY THROUGH THE DAY</span>
            <h2>From assignment<br />to close-out.</h2>
            <p>One connected workflow keeps the practical details together, so you can focus on the work in front of you.</p>
            <a className="text-link" href="/how-it-works">Explore how it works <ArrowRight size={15} /></a>
          </div>
          <div className="workflow-list">
            <article className="workflow-step">
              <span className="step-number">01</span><div className="step-icon"><CalendarDays size={19} /></div>
              <div><h3>Know what’s next</h3><p>Keep assignments, schedules, and availability together in one clear view.</p></div><ArrowDown size={16} className="step-arrow" />
            </article>
            <article className="workflow-step">
              <span className="step-number">02</span><div className="step-icon"><ClipboardCheck size={19} /></div>
              <div><h3>Prepare with purpose</h3><p>Review assignment details, your checklist, and the terms you’ve saved.</p></div><ArrowDown size={16} className="step-arrow" />
            </article>
            <article className="workflow-step">
              <span className="step-number">03</span><div className="step-icon"><Headset size={19} /></div>
              <div><h3>Close the loop</h3><p>Complete a simple close-out and reach a person when you need operational support.</p></div><Check size={17} className="step-complete" />
            </article>
          </div>
        </section>

        <section className="principles-section">
          <div className="section-wrap principles-inner">
            <div><span className="eyebrow">BUILT AROUND THE INTERPRETER</span><h2>Useful tools.<br /><em>Clear boundaries.</em></h2></div>
            <p>VOXRELAY supports the work around an interpreting session. It does not interpret, translate, record, or transcribe. Your workspace is for operational details, preparation, terminology, and human support.</p>
            <a className="principles-link" href="/privacy">Privacy &amp; responsible technology <ArrowUpRight size={15} /></a>
          </div>
        </section>
      </main>

      <footer className="site-footer section-wrap"><a className="wordmark footer-mark" href="/"><span className="brand-mark">V</span><span>VOXRELAY</span></a><span>Professional work, thoughtfully supported.</span><a href="/contact">Contact <ArrowUpRight size={13} /></a></footer>
      <AssistantDock />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<LandingPage />);
