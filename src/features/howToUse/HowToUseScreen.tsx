import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BoxChip } from '@/components/ui/BoxChip';
import { useAsync } from '@/hooks/useAsync';
import { getSets } from '@/db/meta';
import type { LeitnerBox, SetInfo } from '@/types/domain';

type GuideTab = 'getting-started' | 'modes' | 'leitner' | 'tools' | 'shortcuts' | 'faq';

interface ModeInfo {
  id: string;
  name: string;
  badge: string;
  badgeColor: string;
  tagline: string;
  description: string;
  howItWorks: string[];
  tips: string[];
  shortcut: string;
}

const MODES: ModeInfo[] = [
  {
    id: 'flashcards',
    name: 'Flashcards',
    badge: 'Flippable & Casual',
    badgeColor: 'var(--pink)',
    tagline: 'Rapid review with flip-animations, audio pronunciation, and star filters.',
    description:
      'Classic flashcard practice designed for quick orientation and memorization without altering your Leitner progression.',
    howItWorks: [
      'Click card or press Space to flip between term and definition.',
      'Navigate using the Prev/Next buttons, left/right arrow keys, or swipe gestures.',
      'Listen to high-quality audio pronunciation with the "Listen" button.',
      'Toggle card direction anytime: Term → Definition or Definition → Term.',
      'Turn on Autoplay with configurable intervals (2s, 4s, 6s) for hands-free review.',
      'Press "S" or click Star to bookmark tricky words for targeted practice.',
    ],
    tips: [
      'Flashcard browsing does not penalize your spaced repetition intervals.',
      'Use Shuffle to prevent memorizing words purely by serial position.',
    ],
    shortcut: 'Space (Flip) · ← → (Navigate) · S (Star)',
  },
  {
    id: 'learn',
    name: 'Learn',
    badge: '3-Tier Adaptive',
    badgeColor: 'var(--cyan)',
    tagline: 'Smart escalation from multiple-choice recognition to active typing.',
    description:
      'The most scientifically effective mode. It guides you through three cognitive tiers until true recall is achieved.',
    howItWorks: [
      'Tier 1 (Recognition): Pick the matching definition or term from 4 options.',
      'Tier 2 (Recall): Prompted with the definition, choose the correct term.',
      'Tier 3 (Production): Type the exact spelling of the word from memory.',
      'Adaptive queue: If you miss a word, it re-enters the active batch after two intervening questions until mastered.',
      'Rounds of 7: Batched so your working memory is not overloaded.',
    ],
    tips: [
      'Keys 1, 2, 3, 4 trigger multiple choice answers instantly.',
      'Session finishes only when every word is mastered at the production tier.',
    ],
    shortcut: 'Keys 1-4 for multiple choice · Enter to submit typing',
  },
  {
    id: 'write',
    name: 'Write',
    badge: 'Spelling & Recall',
    badgeColor: 'var(--violet)',
    tagline: 'Active recall drill with smart typo forgiveness and custom alias learning.',
    description:
      'See the definition and type the corresponding term. Builds active spelling recall and reinforces exam readiness.',
    howItWorks: [
      'Read the definition and grammatical part of speech.',
      'Type the exact vocabulary word into the input box and press Enter.',
      'Fuzzy matching: 1-letter typos are automatically forgiven via Levenshtein distance on words > 5 chars.',
      'Override button ("I was right"): If you used an acceptable synonym or variant, mark it correct. Vocab Lab remembers it as an alias!',
    ],
    tips: [
      'Great for GRE, SAT, and TOEFL preparation where precise spelling counts.',
      'Accented or hyphenated words are matched gracefully.',
    ],
    shortcut: 'Enter to submit · Enter again to advance',
  },
  {
    id: 'test',
    name: 'Test',
    badge: 'Exam Simulation',
    badgeColor: 'var(--lime)',
    tagline: 'Graded assessment combining multiple-choice, true/false, and written questions.',
    description:
      'Comprehensive exam simulator to evaluate your retention under realistic test conditions.',
    howItWorks: [
      'Takes a sample of the set across various question types.',
      'True/False checks, 4-choice questions, and written prompt entries.',
      'No immediate feedback during the test — scores and answer keys are calculated at completion.',
      'Produces an overall percentage score and itemized review list of correct vs. missed items.',
    ],
    tips: [
      'Take a test once a week to benchmark your long-term retention before moving to a new list.',
    ],
    shortcut: 'Keys 1-4 or T/F · Enter to confirm',
  },
  {
    id: 'match',
    name: 'Match',
    badge: 'Speed Drill',
    badgeColor: 'var(--yellow)',
    tagline: 'Fast-paced grid matching game with personal best records.',
    description:
      'Race against the clock to connect terms with their corresponding definitions in an interactive grid.',
    howItWorks: [
      'A grid of terms and definitions is generated (up to 12 pairs / 24 cells).',
      'Click a term, then click its matching definition (or vice-versa).',
      'Correct matches disappear immediately; mistakes flash red with a brief cooldown.',
      'The millisecond timer tracks your speed, recording your personal best per set.',
    ],
    tips: [
      'Excellent for building rapid mental associations and warm-up before intensive study.',
      'Look for distinctive keywords in long definitions.',
    ],
    shortcut: 'Click / Tap to pair',
  },
];

const LEITNER_BOXES: {
  box: LeitnerBox;
  name: string;
  interval: string;
  colorVar: string;
  description: string;
  onCorrect: string;
  onMiss: string;
}[] = [
  {
    box: 1,
    name: 'Box 1: New & Struggling',
    interval: 'Review Same Session / 1 Day',
    colorVar: 'var(--box-1)',
    description: 'Freshly added words or words answered incorrectly in graded modes.',
    onCorrect: 'Advances to Box 2 (1 day interval)',
    onMiss: 'Remains in Box 1 for immediate repetition',
  },
  {
    box: 2,
    name: 'Box 2: Early Memory',
    interval: '1 Day Interval',
    colorVar: 'var(--box-2)',
    description: 'Words remembered once. Require reinforcement before memory degrades.',
    onCorrect: 'Advances to Box 3 (3 days interval)',
    onMiss: 'Drops back to Box 1',
  },
  {
    box: 3,
    name: 'Box 3: Intermediate Retention',
    interval: '3 Days Interval',
    colorVar: 'var(--box-3)',
    description: 'Solidifying in mid-term memory. Spacing increases to 72 hours.',
    onCorrect: 'Advances to Box 4 (7 days interval)',
    onMiss: 'Drops back to Box 1',
  },
  {
    box: 4,
    name: 'Box 4: Strong Recall',
    interval: '7 Days Interval (1 Week)',
    colorVar: 'var(--box-4)',
    description: 'Reliable recall. Only checked once a week to verify permanence.',
    onCorrect: 'Advances to Box 5 (21 days interval, Mastered!)',
    onMiss: 'Drops back to Box 1',
  },
  {
    box: 5,
    name: 'Box 5: Long-Term Mastery',
    interval: '21 Days Interval (3 Weeks)',
    colorVar: 'var(--box-5)',
    description: 'Permanent vocabulary. Reviewed after three weeks to guarantee lifetime retention.',
    onCorrect: 'Remains in Box 5, interval refreshed',
    onMiss: 'Drops back to Box 1 for relearning',
  },
];

export default function HowToUseScreen() {
  const [activeTab, setActiveTab] = useState<GuideTab>('getting-started');
  const [activeModeIndex, setActiveModeIndex] = useState(0);
  const { data: sets } = useAsync(() => getSets(), []);

  const firstSet = sets?.[0];

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
      {/* Hero Banner */}
      <div className="surface p-6 sm:p-8 bg-[var(--yellow)] flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-display text-xs uppercase px-2.5 py-1 bg-black text-white">
            User Guide & Documentation
          </span>
          <span className="font-body text-xs font-semibold uppercase tracking-wider text-black/80">
            Offline-First Spaced Repetition
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-tight">
          How to Use Vocab Lab
        </h1>
        <p className="font-body text-sm sm:text-base leading-relaxed max-w-2xl">
          Vocab Lab is an offline-first vocabulary laboratory engineered for high-volume mastery.
          Powered by a 5-box Leitner spaced repetition engine, multiple cognitive study modes, and
          zero cloud tracking.
        </p>

        {firstSet && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="font-body text-xs font-bold uppercase">Quick practice:</span>
            <Link to={`/study/${firstSet.id}/flashcards`}>
              <Button variant="pink">Start Flashcards ({firstSet.name})</Button>
            </Link>
            <Link to={`/study/${firstSet.id}/learn`}>
              <Button variant="cyan">Start Learn Mode</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('getting-started')}
          className="press-surface px-3 py-2 font-display uppercase text-xs sm:text-sm"
          style={{ background: activeTab === 'getting-started' ? 'var(--yellow)' : 'var(--paper)' }}
        >
          🚀 Quick Start
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('modes')}
          className="press-surface px-3 py-2 font-display uppercase text-xs sm:text-sm"
          style={{ background: activeTab === 'modes' ? 'var(--cyan)' : 'var(--paper)' }}
        >
          🎮 5 Study Modes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('leitner')}
          className="press-surface px-3 py-2 font-display uppercase text-xs sm:text-sm"
          style={{ background: activeTab === 'leitner' ? 'var(--lime)' : 'var(--paper)' }}
        >
          🧠 Leitner Boxes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className="press-surface px-3 py-2 font-display uppercase text-xs sm:text-sm"
          style={{ background: activeTab === 'tools' ? 'var(--violet)' : 'var(--paper)' }}
        >
          📊 Power Tools
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('shortcuts')}
          className="press-surface px-3 py-2 font-display uppercase text-xs sm:text-sm"
          style={{ background: activeTab === 'shortcuts' ? 'var(--pink)' : 'var(--paper)' }}
        >
          ⌨️ Shortcuts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('faq')}
          className="press-surface px-3 py-2 font-display uppercase text-xs sm:text-sm"
          style={{ background: activeTab === 'faq' ? 'var(--red)' : 'var(--paper)' }}
        >
          💡 FAQ & Tips
        </button>
      </div>

      {/* TAB 1: QUICK START */}
      {activeTab === 'getting-started' && (
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display uppercase text-lg mb-3">The Daily 3-Step Routine</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border-[2px] border-black p-4 bg-[var(--paper)] flex flex-col gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-[var(--yellow)] font-display text-base border-[2px] border-black">
                  1
                </div>
                <h3 className="font-display uppercase text-sm">Check "Due Today"</h3>
                <p className="font-body text-xs leading-relaxed text-black/80">
                  Open the <strong>Home</strong> screen. The counter at the top aggregates all words
                  whose spaced repetition interval has matured today.
                </p>
              </div>

              <div className="border-[2px] border-black p-4 bg-[var(--paper)] flex flex-col gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-[var(--cyan)] font-display text-base border-[2px] border-black">
                  2
                </div>
                <h3 className="font-display uppercase text-sm">Study via Learn or Write</h3>
                <p className="font-body text-xs leading-relaxed text-black/80">
                  Click <strong>Learn</strong> or <strong>Write</strong> on your active set. Graded
                  responses automatically upgrade or reset Leitner boxes based on your accuracy.
                </p>
              </div>

              <div className="border-[2px] border-black p-4 bg-[var(--paper)] flex flex-col gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-[var(--lime)] font-display text-base border-[2px] border-black">
                  3
                </div>
                <h3 className="font-display uppercase text-sm">Review Analytics</h3>
                <p className="font-body text-xs leading-relaxed text-black/80">
                  Check <strong>Stats</strong> to watch words migrate into Box 5 (Mastered), review
                  accuracy velocity over the last 30 sessions, and drill confusion pairs.
                </p>
              </div>
            </div>
          </Card>

          <Card className="bg-[var(--cyan)]">
            <h2 className="font-display uppercase text-sm mb-2">100% Offline & Private</h2>
            <p className="font-body text-xs leading-relaxed">
              Vocab Lab stores your entire dictionary, progress logs, and study sessions locally in
              your browser via <strong>IndexedDB</strong>. No server accounts, no tracking cookies,
              and no cloud latency. All audio synthesis uses your device's native Speech Synthesis API.
              Be sure to use the <strong>Backup</strong> screen periodically to export a JSON file.
            </p>
          </Card>
        </div>
      )}

      {/* TAB 2: 5 STUDY MODES */}
      {activeTab === 'modes' && (
        <div className="flex flex-col gap-4">
          {/* Mode Selector */}
          <div className="flex flex-wrap gap-2">
            {MODES.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveModeIndex(idx)}
                className="press-surface px-3 py-1.5 font-display uppercase text-xs"
                style={{
                  background: activeModeIndex === idx ? m.badgeColor : 'var(--paper)',
                }}
              >
                {m.name}
              </button>
            ))}
          </div>

          {/* Active Mode Details */}
          {(() => {
            const current = MODES[activeModeIndex];
            return (
              <Card>
                <div className="flex items-start justify-between flex-wrap gap-2 pb-3 border-b-[2px] border-black">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display uppercase text-xl">{current.name}</h2>
                      <span
                        className="font-display uppercase text-xs px-2 py-0.5 border-[2px] border-black"
                        style={{ background: current.badgeColor }}
                      >
                        {current.badge}
                      </span>
                    </div>
                    <p className="font-body text-xs text-black/70 mt-1">{current.tagline}</p>
                  </div>

                  {firstSet && (
                    <Link to={`/study/${firstSet.id}/${current.id}`}>
                      <Button variant="ink">Launch {current.name} →</Button>
                    </Link>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-4">
                  <div>
                    <h3 className="font-display uppercase text-xs tracking-wider text-black/60 mb-1">
                      Overview
                    </h3>
                    <p className="font-body text-sm leading-relaxed">{current.description}</p>
                  </div>

                  <div>
                    <h3 className="font-display uppercase text-xs tracking-wider text-black/60 mb-2">
                      How It Works
                    </h3>
                    <ul className="flex flex-col gap-2 font-body text-xs">
                      {current.howItWorks.map((step, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-display text-[11px] bg-black text-white px-1.5 py-0.5 min-w-[20px] text-center">
                            {i + 1}
                          </span>
                          <span className="leading-snug">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3 border-[2px] border-black bg-[var(--paper)] flex flex-col gap-1">
                    <span className="font-display uppercase text-xs">⌨️ Shortcuts / Control</span>
                    <p className="font-body text-xs text-black/80 font-mono">{current.shortcut}</p>
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>
      )}

      {/* TAB 3: LEITNER SYSTEM */}
      {activeTab === 'leitner' && (
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display uppercase text-lg mb-2">The 5-Box Leitner Engine</h2>
            <p className="font-body text-xs leading-relaxed text-black/80 mb-4">
              Vocab Lab does not guess your forgetting curve with arbitrary formulas. It uses the
              rigorous 5-box Leitner progression. Each time you answer correctly in a graded mode
              (Learn, Write, or Test), the card advances to the next box with an exponentially
              longer review interval. A single mistake immediately returns the word to Box 1.
            </p>

            <div className="flex flex-col gap-3">
              {LEITNER_BOXES.map((b) => (
                <div
                  key={b.box}
                  className="border-[2px] border-black p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  style={{ background: 'var(--paper)' }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 border-[2px] border-black flex items-center justify-center font-display text-lg shrink-0"
                      style={{ background: b.colorVar }}
                    >
                      {b.box}
                    </div>
                    <div>
                      <h3 className="font-display uppercase text-sm flex items-center gap-2">
                        {b.name}
                        <span className="font-mono text-xs font-normal text-black/70">
                          ({b.interval})
                        </span>
                      </h3>
                      <p className="font-body text-xs mt-1 text-black/80">{b.description}</p>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0 font-body text-xs flex flex-col gap-0.5">
                    <span className="text-green-700 font-semibold">✔ {b.onCorrect}</span>
                    <span className="text-red-600 font-semibold">✘ {b.onMiss}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-[var(--lime)]">
            <h3 className="font-display uppercase text-sm mb-1">Mastery Criteria</h3>
            <p className="font-body text-xs leading-relaxed">
              When a word graduates into <strong>Box 5</strong> and is answered correctly after 21
              days, it enters permanent mastery status. You can filter for Box 5 words in the Browse
              screen or generate mastery reports on the Stats page.
            </p>
          </Card>
        </div>
      )}

      {/* TAB 4: POWER TOOLS */}
      {activeTab === 'tools' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display uppercase text-base">🔍 Browse & Search</h3>
              <Link to="/browse">
                <Button variant="cyan">Open</Button>
              </Link>
            </div>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Instant sub-millisecond search across up to 25,000 words. Filter by set, grammatical
              part of speech, starred status, or current Leitner box. View full definitions, example
              sentences, and alternate aliases.
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display uppercase text-base">📈 Stats & Confusion</h3>
              <Link to="/stats">
                <Button variant="violet">Open</Button>
              </Link>
            </div>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Visual box distribution charts, session accuracy timeline (last 30 runs), slowest
              words by response latency, and algorithmic <strong>Confusion Pairs</strong> detection
              with targeted drill mode.
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display uppercase text-base">🎧 Audio Review</h3>
              <Link to="/audio-review">
                <Button variant="cyan">Open</Button>
              </Link>
            </div>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Hands-free listening station. Streams vocabulary words and definitions consecutively
              using browser text-to-speech. Perfect for commutes, walks, or auditory learners.
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display uppercase text-base">📄 Study Guide Export</h3>
              <Link to="/study-guide">
                <Button variant="lime">Open</Button>
              </Link>
            </div>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Compile any number of sets into a beautifully formatted Markdown or print-ready HTML
              study packet, complete with thematic word groupings and confusion warnings.
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display uppercase text-base">✍️ Word Enrichment</h3>
              <Link to="/enrichment">
                <Button variant="pink">Open</Button>
              </Link>
            </div>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Add personal mnemonic notes, roots/etymologies, real-world example sentences, and
              custom context to any word in your database.
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display uppercase text-base">📥 Import & Backup</h3>
              <div className="flex gap-1">
                <Link to="/import">
                  <Button variant="yellow">Import</Button>
                </Link>
                <Link to="/backup">
                  <Button variant="paper">Backup</Button>
                </Link>
              </div>
            </div>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Paste or upload raw vocabulary lists (SAT, GRE, TOEFL, or custom words). Export a full
              JSON snapshot of your entire progress history to sync across devices or keep backups.
            </p>
          </Card>
        </div>
      )}

      {/* TAB 5: KEYBOARD SHORTCUTS */}
      {activeTab === 'shortcuts' && (
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-display uppercase text-lg mb-3">Global & Mode Keyboard Shortcuts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-xs border-collapse">
                <thead>
                  <tr className="border-b-[2px] border-black bg-[var(--yellow)]">
                    <th className="p-2 font-display uppercase">Shortcut Key</th>
                    <th className="p-2 font-display uppercase">Context / Mode</th>
                    <th className="p-2 font-display uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y-[1px] divide-black">
                  <tr>
                    <td className="p-2 font-mono font-bold">Spacebar</td>
                    <td className="p-2">Flashcards</td>
                    <td className="p-2">Flip card between term and definition</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono font-bold">← / →</td>
                    <td className="p-2">Flashcards</td>
                    <td className="p-2">Navigate to Previous / Next card</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono font-bold">S</td>
                    <td className="p-2">Flashcards</td>
                    <td className="p-2">Star / Unstar the current word</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono font-bold">1, 2, 3, 4</td>
                    <td className="p-2">Learn / Test / Multiple Choice</td>
                    <td className="p-2">Select answer options 1 through 4</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono font-bold">Enter</td>
                    <td className="p-2">Write / Learn (Tier 3)</td>
                    <td className="p-2">Submit typed spelling or advance to next question</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono font-bold">Tab / Shift+Tab</td>
                    <td className="p-2">Everywhere</td>
                    <td className="p-2">Accessible keyboard focus navigation across all surfaces</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="bg-[var(--pink)]">
            <h3 className="font-display uppercase text-sm mb-1">Accessibility First</h3>
            <p className="font-body text-xs leading-relaxed">
              Every button, card, and question in Vocab Lab is fully navigable using only the
              keyboard, with strict ARIA status messages and high-contrast visible focus indicators.
            </p>
          </Card>
        </div>
      )}

      {/* TAB 6: FAQ & TIPS */}
      {activeTab === 'faq' && (
        <div className="flex flex-col gap-4">
          <Card>
            <h3 className="font-display uppercase text-sm mb-1">
              Q: Where is my data saved? Will I lose my progress if I close the tab?
            </h3>
            <p className="font-body text-xs leading-relaxed text-black/80">
              All data is stored directly in your browser's persistent IndexedDB database. You can
              safely close the tab, restart your browser, or shut down your computer. To prevent
              accidental loss (e.g. clearing browser cache), visit the <strong>Backup</strong> tab
              and click <strong>Export JSON backup</strong>.
            </p>
          </Card>

          <Card>
            <h3 className="font-display uppercase text-sm mb-1">
              Q: What should I do if I spelled a word slightly differently?
            </h3>
            <p className="font-body text-xs leading-relaxed text-black/80">
              In <strong>Write</strong> mode, minor single-character typos are automatically forgiven.
              If you used a valid alternative spelling or synonym that the system marked wrong, click
              the <strong>"I was right"</strong> button. The app will immediately grant full credit
              and save your spelling as a recognised alias for that word forever.
            </p>
          </Card>

          <Card>
            <h3 className="font-display uppercase text-sm mb-1">
              Q: How do I import my own custom word list?
            </h3>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Go to the <strong>Import</strong> tab in the top header. You can paste any list formatted
              as <code>term &lt;tab&gt; definition</code> or <code>term: definition</code>, give it a
              set name, and Vocab Lab's background worker will parse, validate, and index all words
              instantly off the main thread.
            </p>
          </Card>

          <Card>
            <h3 className="font-display uppercase text-sm mb-1">
              Q: What are "Confusion Pairs"?
            </h3>
            <p className="font-body text-xs leading-relaxed text-black/80">
              Confusion pairs are words that look or sound alike (e.g., <em>affect</em> vs.{' '}
              <em>effect</em>, or <em>discreet</em> vs. <em>discrete</em>) or words you repeatedly
              mix up in tests. Vocab Lab's background engine analyzes your misses and surfaces them
              on the <strong>Stats</strong> screen, offering an instant drill mode to disentangle
              them.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
