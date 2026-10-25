// The cloud copy of your saved data: Google sign-in (Firebase Auth) and one
// Firestore document per account, users/{uid}. Firebase is loaded only when it's
// needed (you press Sign in, or you signed in before), so the site stays light
// for everyone else. lib/sync.ts decides what to send and when.
import type { Snapshot } from './transfer'
import { PREFIX } from './storage'

/** The web app's Firebase settings (web/.env: VITE_FIREBASE_*). These are public by design. */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export type CloudUnavailable = 'not-set-up' | 'file'

/** Why cloud sync can't work on this copy of the site, or null if it can. */
export function cloudUnavailable(): CloudUnavailable | null {
  if (typeof location !== 'undefined' && location.protocol === 'file:') return 'file'
  return config.apiKey && config.projectId && config.authDomain ? null : 'not-set-up'
}

export interface CloudUser {
  uid: string
  name: string | null
  email: string | null
}

export interface CloudCopy {
  data: Snapshot
  /** ms since epoch; 0 if unknown */
  updatedAt: number
  /** Which computer saved it last ("Windows · Chrome"). */
  device: string | null
  deviceId: string | null
}

/** Firestore field names can't hold every character, and dots read as paths: "presets.active.v1" -> "presets_active_v1". */
export function encodeKey(key: string): string {
  return key.slice(PREFIX.length).replace(/_/g, '__').replace(/\./g, '_')
}
export function decodeKey(field: string): string {
  return PREFIX + field.replace(/__|_/g, (m) => (m === '__' ? '_' : '.'))
}

type Firebase = Awaited<ReturnType<typeof load>>
let loading: Promise<Firebase> | null = null

async function load() {
  const [{ initializeApp }, auth, store] = await Promise.all([
    import('firebase/app'), import('firebase/auth'), import('firebase/firestore'),
  ])
  const app = initializeApp(config as Required<typeof config>)
  const authObj = auth.getAuth(app)
  const db = store.getFirestore(app)
  // Local testing against the Firebase emulators (`firebase emulators:start`, VITE_FIREBASE_EMULATOR=1).
  if (import.meta.env.VITE_FIREBASE_EMULATOR) {
    auth.connectAuthEmulator(authObj, 'http://127.0.0.1:9099', { disableWarnings: true })
    store.connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  return { auth, store, authObj, db }
}

function firebase(): Promise<Firebase> {
  loading ??= load().catch((e) => { loading = null; throw e })
  return loading
}

const toUser = (u: { uid: string; displayName: string | null; email: string | null }): CloudUser =>
  ({ uid: u.uid, name: u.displayName, email: u.email })

/** Calls back with the signed-in user (or null) now and whenever it changes. */
export async function watchUser(cb: (u: CloudUser | null) => void): Promise<() => void> {
  const fb = await firebase()
  return fb.auth.onAuthStateChanged(fb.authObj, (u) => cb(u ? toUser(u) : null))
}

export async function signIn(): Promise<void> {
  const fb = await firebase()
  const provider = new fb.auth.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await fb.auth.signInWithPopup(fb.authObj, provider)
  } catch (e) {
    const code = (e as { code?: string }).code
    // Popups blocked (some phones and strict browsers): go to Google's page and come back.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await fb.auth.signInWithRedirect(fb.authObj, provider)
      return
    }
    throw e
  }
}

export async function signOut(): Promise<void> {
  const fb = await firebase()
  await fb.auth.signOut(fb.authObj)
}

function fromDoc(d: Record<string, unknown> | undefined): CloudCopy | null {
  if (!d) return null
  const data: Snapshot = {}
  for (const [field, v] of Object.entries((d.data ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string') data[decodeKey(field)] = v
  }
  const ts = d.updatedAt as { toMillis?: () => number } | null | undefined
  return {
    data,
    updatedAt: typeof ts?.toMillis === 'function' ? ts.toMillis() : 0,
    device: typeof d.device === 'string' ? d.device : null,
    deviceId: typeof d.deviceId === 'string' ? d.deviceId : null,
  }
}

export async function readCloud(uid: string): Promise<CloudCopy | null> {
  const fb = await firebase()
  const snap = await fb.store.getDoc(fb.store.doc(fb.db, 'users', uid))
  return snap.exists() ? fromDoc(snap.data()) : null
}

/**
 * Calls back with the cloud copy whenever it changes on the server (another
 * computer saved). This computer's own saves are skipped.
 */
export async function watchCloud(uid: string, cb: (c: CloudCopy | null) => void, onError: (e: unknown) => void): Promise<() => void> {
  const fb = await firebase()
  return fb.store.onSnapshot(fb.store.doc(fb.db, 'users', uid), (snap) => {
    if (snap.metadata.hasPendingWrites) return
    cb(snap.exists() ? fromDoc(snap.data()) : null)
  }, onError)
}

/**
 * Save these keys to the cloud copy (null removes one). `replace` writes the whole
 * copy instead, dropping keys that aren't in `changes`.
 */
export async function writeCloud(uid: string, changes: Record<string, string | null>, who: { device: string; deviceId: string }, replace = false): Promise<void> {
  const fb = await firebase()
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(changes)) {
    if (v !== null) data[encodeKey(k)] = v
    else if (!replace) data[encodeKey(k)] = fb.store.deleteField()
  }
  const body = { data, updatedAt: fb.store.serverTimestamp(), device: who.device, deviceId: who.deviceId, app: 1 }
  const ref = fb.store.doc(fb.db, 'users', uid)
  if (replace) await fb.store.setDoc(ref, body)
  else await fb.store.setDoc(ref, body, { merge: true })
}

/** "Windows · Chrome" — shown as where the cloud copy was last saved from. */
export function deviceLabel(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser'
  return `${os} · ${browser}`
}
