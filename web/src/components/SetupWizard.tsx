import { useState, type ReactNode } from 'react'
import { cloudUnavailable } from '../lib/cloud'
import type { ArtVariant } from '../lib/images'
import type { Ego } from '../lib/ego'
import { ownedEgoSet } from '../lib/myegos'
import { ownedIdentitySet } from '../lib/myidentities'
import { sync, useSync } from '../lib/sync'
import type { Identity } from '../lib/types'
import { MyCollection } from './MyCollection'

/** limbussite.setup.v1: null until you finish or skip the setup. */
export type SetupState = 'done' | 'skipped' | null
export const SETUP_KEY = 'limbussite.setup.v1'

type Step = 'data' | 'identities' | 'done'
const STEPS: { id: Step; label: string }[] = [
  { id: 'data', label: 'Bring your data' },
  { id: 'identities', label: 'Identities & E.G.O you own' },
  { id: 'done', label: 'Ready' },
]

/**
 * First-time setup: sign in (or load a backup) so a returning player's data comes
 * along, then mark the identities you own. Every step can be skipped, and so can
 * the whole thing.
 */
export function SetupWizard({ identities, stored, onIdentitiesChange, egos, storedEgos, onEgosChange, art, hasTeam, onOpenData, onSkip, onFinish }: {
  identities: Identity[]
  /** Saved owned identity ids (My identities). */
  stored: string[]
  onIdentitiesChange: (ids: string[]) => void
  egos: Ego[]
  storedEgos: string[]
  onEgosChange: (ids: string[]) => void
  art: ArtVariant
  /** Your data already has a lineup (e.g. it just came in from the cloud). */
  hasTeam: boolean
  onOpenData: () => void
  onSkip: () => void
  /** Leave setup; `demo` loads the demo team instead of going to your team. */
  onFinish: (to: 'team' | 'demo') => void
}) {
  const [step, setStep] = useState<Step>('data')
  const index = STEPS.findIndex((s) => s.id === step)
  const go = (s: Step) => { setStep(s); window.scrollTo(0, 0) }
  const owned = ownedIdentitySet(stored, identities).size
  const ownedEgos = ownedEgoSet(storedEgos, egos).size

  return (
    <div className="setup">
      <header className="setup-head">
        <div>
          <p className="setup-eyebrow">Set up LimbusSite</p>
          <ol className="setup-steps" aria-label="Setup steps">
            {STEPS.map((s, k) => (
              <li key={s.id} className={k === index ? 'on' : k < index ? 'past' : ''} aria-current={k === index ? 'step' : undefined}>
                <span className="setup-step-num">{k < index ? '✓' : k + 1}</span>
                <span className="setup-step-label">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>
        {step !== 'done' && (
          <button className="link-btn setup-skip" onClick={onSkip} title="You can change all of this later (Tools > My identities, and the cloud button)">
            Skip setup
          </button>
        )}
      </header>

      <main className="setup-body" key={step}>
        {step === 'data' && <DataStep hasTeam={hasTeam} marked={stored.length > 0} owned={owned} onOpenData={onOpenData} onDone={() => go('done')} />}
        {step === 'identities' && (
          <>
            <StepIntro title="Which identities and E.G.O do you own?">
              Import them from screenshots of your lists in the game, or tap every one you have (<b>Select all</b> per Sinner
              helps). Switch between identities and E.G.O at the top. Suggestions can then stick to what you actually have.
            </StepIntro>
            <MyCollection identities={identities} storedIdentities={stored} onIdentitiesChange={onIdentitiesChange}
              egos={egos} storedEgos={storedEgos} onEgosChange={onEgosChange} art={art} onOpenData={onOpenData} importOpen />
          </>
        )}
        {step === 'done' && (
          <div className="setup-ready">
            <StepIntro title="You're set up">
              {owned > 12
                ? <>You own <b>{owned}</b> of {identities.length} identities and <b>{ownedEgos}</b> of {egos.length} E.G.O. Change them any time in <b>Home › My identities &amp; E.G.O</b>.</>
                : <>You can mark the identities and E.G.O you own any time in <b>Home › My identities &amp; E.G.O</b>.</>}
            </StepIntro>
            <div className="setup-choices">
              <button className="welcome-btn primary" onClick={() => onFinish('team')}>
                <span>{hasTeam ? 'Go to my team' : 'Build my team'}</span>
                <small>{hasTeam ? 'Your lineup is ready' : 'Pick your sinners and identities'}</small>
              </button>
              <button className="welcome-btn" onClick={() => onFinish('demo')}>
                <span>Try the demo team</span>
                <small>A Heishou lineup on a Hard run</small>
              </button>
            </div>
          </div>
        )}
      </main>

      {step !== 'done' && (
        <footer className="setup-foot">
          <button className="btn" disabled={index === 0} onClick={() => go(STEPS[index - 1].id)}>← Back</button>
          <span className="muted small setup-foot-hint">
            {step === 'data' ? 'New here? Just press Next.' : `${owned} identities · ${ownedEgos} E.G.O`}
          </span>
          <button className="btn primary" onClick={() => go(STEPS[index + 1].id)}>
            {step === 'identities' && stored.length === 0 && storedEgos.length === 0 ? 'Skip this step →' : 'Next →'}
          </button>
        </footer>
      )}
    </div>
  )
}

function StepIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="setup-intro">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}

/** Step 1: sign in or load a backup. Returning players can finish right here. */
function DataStep({ hasTeam, marked, owned, onOpenData, onDone }: {
  hasTeam: boolean; marked: boolean; owned: number; onOpenData: () => void; onDone: () => void
}) {
  const found = [marked ? `${owned} identities owned` : '', hasTeam ? 'your team' : ''].filter(Boolean).join(' and ')
  const { status } = useSync()
  const noCloud = cloudUnavailable()
  const signedIn = status.kind === 'synced'
  return (
    <>
      <StepIntro title="Played on another computer?">
        Sign in to keep your team, gifts and identities on your account and bring them to any computer. Or load a backup
        file. New here? Press <b>Next</b>: everything is saved on this computer, and you can sign in later.
      </StepIntro>
      <div className="setup-cards">
        {!noCloud && (
          <div className={`setup-card${signedIn ? ' ok' : ''}`}>
            <h3>Sign in with Google</h3>
            {status.kind === 'synced' && <p className="good">✓ Signed in as {status.user.name ?? status.user.email ?? 'you'}. Your data saves as you go.</p>}
            {status.kind === 'working' && <p className="muted">{status.what}…</p>}
            {status.kind === 'ask' && (
              <p>Both this computer and your account have data. <button className="link-btn accent" onClick={onOpenData}>Pick which copy to keep</button></p>
            )}
            {status.kind === 'signed-out' && (
              <>
                <p className="muted">Free, and only you can see your data.</p>
                {status.error && <p className="bad small">{status.error}</p>}
                <button className="btn primary" onClick={() => void sync.signIn()}>Sign in with Google</button>
              </>
            )}
          </div>
        )}
        <div className="setup-card">
          <h3>Load a backup file</h3>
          <p className="muted">A LimbusSite backup you saved earlier (Your data › Save a backup).</p>
          <button className="btn" onClick={onOpenData}>Load a backup…</button>
        </div>
      </div>
      {found && (
        <div className="setup-found">
          <p><b>Your data is here:</b> {found}.</p>
          <button className="btn primary" onClick={onDone}>Finish setup</button>
        </div>
      )}
    </>
  )
}
