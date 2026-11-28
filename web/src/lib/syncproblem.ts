// What went wrong with sign-in or cloud saving, in words a player can act on (t11).
// lib/sync.ts turns every Firebase error into one of these; the screens show the
// title and detail with a Try again button (components/SyncPanel.tsx, ProblemNote).

export type ProblemKind = 'offline' | 'popup-blocked' | 'domain' | 'denied' | 'failed'
/** What we were doing when it failed. */
export type ProblemDuring = 'sign-in' | 'load' | 'save' | 'choose' | 'live'

export interface SyncProblem {
  kind: ProblemKind
  during: ProblemDuring
  /** One line: what happened. */
  title: string
  /** What it means for your data and what to do. */
  detail: string
  /** How it gets fixed without you: when you're back online, or another try shortly. */
  next?: 'online' | 'soon'
}

/** The error codes Firebase (Auth and Firestore) and our own time limit use for "no connection". */
const OFFLINE_CODES = new Set([
  'auth/network-request-failed', 'auth/timeout', 'unavailable', 'deadline-exceeded', 'timeout',
])

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function codeOf(e: unknown): string {
  return (e as { code?: unknown })?.code && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : ''
}

/** Firebase messages look like "Firebase: Error (auth/internal-error)." — keep the readable part. */
function plainMessage(e: unknown): string {
  const raw = (e as { message?: unknown })?.message
  const text = typeof raw === 'string' ? raw : typeof e === 'string' ? e : ''
  const cleaned = text.replace(/^Firebase:\s*/i, '').replace(/\s*\((auth|firestore)\/[^)]*\)\.?$/, '').replace(/^Error\s*$/, '').trim()
  const code = codeOf(e)
  if (cleaned) return cleaned.endsWith('.') ? cleaned : `${cleaned}.`
  return code ? `Error code: ${code}.` : 'Unknown error.'
}

export function kindOf(e: unknown, online = isOnline()): ProblemKind {
  const code = codeOf(e)
  if (code === 'auth/popup-blocked') return 'popup-blocked'
  if (code === 'auth/unauthorized-domain') return 'domain'
  if (code === 'permission-denied' || code === 'unauthenticated') return 'denied'
  if (!online || OFFLINE_CODES.has(code) || code.includes('network')) return 'offline'
  return 'failed'
}

/** Turn an error into a problem to show. `online`: whether the browser thinks it has a connection. */
export function describeProblem(e: unknown, during: ProblemDuring, online = isOnline()): SyncProblem {
  const kind = kindOf(e, online)
  const p = (title: string, detail: string): SyncProblem => ({ kind, during, title, detail })
  switch (kind) {
    case 'popup-blocked':
      return p('Your browser blocked the Google sign-in window.',
        'Allow pop-ups for this site (look for a blocked pop-up icon in the address bar), then press Try again. Or sign in on Google\'s own page instead.')
    case 'domain':
      return p('Sign-in isn\'t allowed on this web address yet.',
        'Open the site at gesellschaftmd.com, or add this address under Authentication › Settings › Authorized domains in Firebase.')
    case 'offline': {
      // The browser says it's offline, or it's online but the request never got through.
      const off = !online
      switch (during) {
        case 'sign-in': return p(off ? 'You\'re offline, so Google sign-in can\'t open.' : 'Couldn\'t reach Google to sign in.',
          'Your data is still saved on this computer. Check your internet connection and try again.')
        case 'save': return p(off ? 'You\'re offline, so your latest changes aren\'t on your account yet.' : 'Can\'t reach your account, so your latest changes aren\'t saved there yet.',
          'They\'re kept on this computer and saved to your account once the connection is back, even if you close the page first.')
        case 'choose': return p(off ? 'You\'re offline, so your choice couldn\'t be saved.' : 'Couldn\'t reach your account, so your choice wasn\'t saved.',
          'Nothing was replaced. Check your internet connection and pick again.')
        default: return p(off ? 'You\'re offline, so your data isn\'t syncing.' : 'Can\'t reach your account right now.',
          'Your data is still saved on this computer, and changes you make are kept here. It syncs again once the connection is back.')
      }
    }
    case 'denied':
      return during === 'save'
        ? p('Your account didn\'t accept the save (permission denied).',
          'Your changes are kept on this computer. Try again, or sign out and back in. If it keeps happening, download a backup file so nothing is lost.')
        : p('Your account refused the request (permission denied).',
          'Your data on this computer is untouched. Try again, or sign out and back in.')
    case 'failed':
      switch (during) {
        case 'sign-in': return p('Sign-in didn\'t work.', `${plainMessage(e)} Your data is still saved on this computer.`)
        case 'save': return p('Couldn\'t save your latest changes to your account.', `${plainMessage(e)} They're kept on this computer until they're saved.`)
        case 'choose': return p('Couldn\'t finish syncing.', `${plainMessage(e)} Nothing was replaced; pick again to retry.`)
        default: return p('Couldn\'t load your cloud copy.', `${plainMessage(e)} Your data on this computer is untouched, and changes you make are kept here.`)
      }
  }
}

/** A network call that hangs (Firestore waits forever for a connection) fails after `ms` instead. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('The request took too long.'), { code: 'timeout' })), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Wait before trying again: 5 s, 15 s, 30 s, then every minute. */
export function retryDelay(attempt: number): number {
  return [5000, 15000, 30000][attempt] ?? 60000
}
