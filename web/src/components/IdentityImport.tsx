import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shortName } from '../lib/format'
import {
  readIdentityAtlas, readIdentityScreenshot, type CardMatch, type IdentityAtlasMeta, type IdentityRef,
} from '../lib/idscreenshot'
import type { Pixels } from '../lib/screenshot'
import type { Identity } from '../lib/types'

interface Shot {
  key: number
  name: string
  status: 'reading' | 'done' | 'error'
  error?: string
  matches: CardMatch[]
  /** A small picture of each card, for checking the match. */
  crops: string[]
}

/** Each card's pick: an identity id, or null to leave it out. Keyed by `${shot}:${card}`. */
type Picks = Record<string, string | null>

let refsPromise: Promise<IdentityRef[]> | null = null

/** The card-art references (scraper/identity_art.py), loaded the first time a screenshot comes in. */
function loadRefs(): Promise<IdentityRef[]> {
  refsPromise ??= Promise.all([import('../data/identity_art.png?inline'), import('../data/identity_art.json')])
    .then(([png, meta]) => new Promise<IdentityRef[]>((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, c.width, c.height)
        try {
          resolve(readIdentityAtlas({ data: d.data, width: d.width, height: d.height }, meta.default as IdentityAtlasMeta))
        } catch (e) { reject(e) }
      }
      img.onerror = () => reject(new Error('Could not load the identity pictures'))
      img.src = png.default
    }))
  refsPromise.catch(() => { refsPromise = null })
  return refsPromise
}

const nextFrame = () => new Promise((r) => setTimeout(r, 0))

async function readImage(file: Blob): Promise<{ pixels: Pixels; canvas: HTMLCanvasElement }> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bitmap, 0, 0)
  bitmap.close()
  const d = g.getImageData(0, 0, canvas.width, canvas.height)
  return { pixels: { data: d.data, width: d.width, height: d.height }, canvas }
}

/** The top of the card (the part that was compared, roughly), 48 x 64. */
function cropOf(canvas: HTMLCanvasElement, m: CardMatch): string {
  const { x, y, w, h } = m.box
  const c = document.createElement('canvas')
  c.width = 48
  c.height = 64
  c.getContext('2d')!.drawImage(canvas, x, y + 0.05 * h, w, 0.45 * h, 0, 0, 48, 64)
  return c.toDataURL('image/png')
}

/**
 * "Import from screenshots" on My identities: screenshots of the game's identity list fill in
 * the identities you own. Only adds; nothing is unmarked. Read in the browser, never uploaded.
 */
export function IdentityImport({ identities, owned, onAdd, startOpen = false }: {
  identities: Identity[]
  /** Identities you own now (base ones included). */
  owned: ReadonlySet<string>
  onAdd: (ids: string[]) => void
  startOpen?: boolean
}) {
  const byId = useMemo(() => new Map(identities.map((i) => [i.id, i])), [identities])
  const [open, setOpen] = useState(startOpen)
  const [shots, setShots] = useState<Shot[]>([])
  const [picks, setPicks] = useState<Picks>({})
  const [done, setDone] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const keyRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setOpen(true)
    setDone(null)
    for (const file of images) {
      const key = ++keyRef.current
      setShots((s) => [...s, { key, name: file.name || 'Pasted screenshot', status: 'reading', matches: [], crops: [] }])
      try {
        const [refs, { pixels, canvas }] = await Promise.all([loadRefs(), readImage(file)])
        await nextFrame()
        const matches = readIdentityScreenshot(pixels, refs)
        const crops = matches.map((m) => cropOf(canvas, m))
        setShots((s) => s.map((x) => (x.key === key ? { ...x, status: 'done', matches, crops } : x)))
        setPicks((p) => {
          const out = { ...p }
          matches.forEach((m, i) => { out[`${key}:${i}`] = m.confidence === 'unsure' ? null : m.candidates[0].id })
          return out
        })
      } catch (e) {
        setShots((s) => s.map((x) => (x.key === key ? { ...x, status: 'error', error: e instanceof Error ? e.message : String(e) } : x)))
      }
    }
  }, [])

  // Paste a screenshot anywhere on the screen (Ctrl+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) { e.preventDefault(); void addFiles(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const picked = [...new Set(shots.filter((s) => s.status === 'done')
    .flatMap((s) => s.matches.map((_, i) => picks[`${s.key}:${i}`]).filter((id): id is string => !!id)))]
  const newOnes = picked.filter((id) => !owned.has(id))
  const cards = shots.reduce((n, s) => n + s.matches.length, 0)

  const apply = () => {
    onAdd(newOnes)
    setDone(`Marked ${newOnes.length} identit${newOnes.length === 1 ? 'y' : 'ies'} as owned.`)
    setShots([])
    setPicks({})
  }

  if (!open) {
    return (
      <div className="idimport-closed">
        <button className="btn" onClick={() => setOpen(true)}>📷 Import from screenshots</button>
        <span className="muted small">Faster than tapping: screenshot your identity list in the game.</span>
        {done && <span className="import-done small">{done}</span>}
      </div>
    )
  }

  return (
    <section className="idimport">
      <header className="idimport-head">
        <h3>Import from screenshots</h3>
        <button className="link-btn" onClick={() => { setOpen(false); setShots([]); setPicks({}) }}>Close</button>
      </header>
      <ol className="idimport-steps">
        <li>In the game, open <b>Sinners › Identities</b>, pick <b>ALL</b> on the left, and tick <b>Obtained</b> at the top right.</li>
        <li>Take a screenshot, scroll down, and take another until you reach the end. Overlapping is fine.</li>
        <li>Drop them here (or paste with Ctrl+V). They're read here in your browser and never uploaded.</li>
      </ol>
      <div className={`import-drop${dragging ? ' on' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles([...e.dataTransfer.files]) }}>
        <p>Drop screenshots here, paste one (Ctrl+V), or</p>
        <button className="btn" onClick={() => fileRef.current?.click()}>Choose screenshots</button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
      </div>
      {done && <p className="import-done">{done}</p>}

      {shots.map((s, si) => (
        <div key={s.key} className="idimport-shot">
          <div className="idimport-shot-head">
            <b>Screenshot {si + 1}</b> <span className="muted small">{s.name}</span>
            <button className="link-btn" onClick={() => setShots((x) => x.filter((y) => y.key !== s.key))}>Remove</button>
          </div>
          {s.status === 'reading' && <p className="muted small">Reading…</p>}
          {s.status === 'error' && <p className="reason reason-bad small">Couldn't read this image: {s.error}</p>}
          {s.status === 'done' && s.matches.length === 0 && (
            <p className="reason reason-bad small">
              No identity cards found. Use the Sinners › Identities screen (not the team screen) and keep whole cards in the screenshot.
            </p>
          )}
          {s.matches.length > 0 && (
            <ol className="idimport-cards">
              {s.matches.map((m, i) => {
                const key = `${s.key}:${i}`
                const pick = picks[key] ?? null
                const ident = pick ? byId.get(pick) : undefined
                return (
                  <li key={key} className={`idimport-card import-${m.confidence}${pick ? '' : ' import-off'}`}>
                    <img src={s.crops[i]} alt="" width={48} height={64} className="import-crop" />
                    <div className="import-body">
                      <div className="import-top">
                        {ident
                          ? <span className="idimport-name">{shortName(ident)} <span className="muted">{ident.sinner}</span></span>
                          : <span className="muted">Left out</span>}
                        {m.confidence === 'check' && <span className="pill pill-check">Check this</span>}
                        {ident && owned.has(ident.id) && <span className="muted small">Already marked</span>}
                      </div>
                      <select value={pick ?? ''} aria-label="Which identity is this?"
                        onChange={(e) => setPicks((p) => ({ ...p, [key]: e.target.value || null }))}>
                        {m.candidates.map((c) => (
                          <option key={c.id} value={c.id}>{byId.get(c.id)?.name ?? c.id} ({Math.round(c.score * 100)}%)</option>
                        ))}
                        <option value="">Not one I own / leave it out</option>
                      </select>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      ))}

      {cards > 0 && (
        <div className="idimport-apply">
          <p>
            <b>{picked.length}</b> identit{picked.length === 1 ? 'y' : 'ies'} found
            {picked.length > newOnes.length ? `, ${picked.length - newOnes.length} already marked` : ''}.
            <span className="muted small"> Cards marked "Check this" look a lot like another identity: compare them with the picture.</span>
          </p>
          <button className="btn primary" disabled={!newOnes.length} onClick={apply}>
            Mark {newOnes.length} as owned
          </button>
        </div>
      )}
    </section>
  )
}
