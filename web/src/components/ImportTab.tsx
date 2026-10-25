import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import atlasUrl from '../data/gift_icons.png?inline'
import atlasMeta from '../data/gift_icons.json'
import {
  CONFIDENCE, applyImport, findTiles, matchTile, mergePicks, readAtlas, tileBox,
  type Pixels, type Reference, type TileMatch,
} from '../lib/screenshot'
import type { Gift } from '../lib/types'
import { isVestige } from '../lib/vestiges'
import { GiftLabel } from './bits'

interface Props {
  gifts: Gift[]
  owned: string[]
  onOwnedChange: (owned: string[]) => void
}

interface Shot {
  key: number
  name: string
  status: 'reading' | 'done' | 'error'
  error?: string
  matches: TileMatch[]
  /** A small picture of each tile, for checking the match. */
  crops: string[]
}

/** Each tile's pick: a gift id, or null to leave it out. Keyed by `${shot}:${tile}`. */
type Picks = Record<string, string | null>

let refsPromise: Promise<Reference[]> | null = null

/** The gift references (scraper/icons.py), loaded once. */
function loadRefs(tierOf: (id: string) => number | null): Promise<Reference[]> {
  refsPromise ??= new Promise<Reference[]>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height)
      resolve(readAtlas({ data: d.data, width: d.width, height: d.height }, atlasMeta, tierOf))
    }
    img.onerror = () => reject(new Error('Could not load the gift pictures'))
    img.src = atlasUrl
  })
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

function cropOf(canvas: HTMLCanvasElement, m: TileMatch): string {
  const b = tileBox(m.anchor)
  const c = document.createElement('canvas')
  c.width = c.height = 72
  c.getContext('2d')!.drawImage(canvas, b.x, b.y, b.size, b.size, 0, 0, 72, 72)
  return c.toDataURL('image/png')
}

const CONF_LABEL: Record<TileMatch['confidence'], string> = { sure: '', check: 'Check this', unsure: 'Not sure' }

/**
 * Import tab: drop, paste or pick screenshots of your gifts and it fills in Gifts you have.
 * Each tile's match is shown next to the tile so you can fix or skip it first.
 */
export function ImportTab({ gifts, owned, onOwnedChange }: Props) {
  const byId = useMemo(() => new Map(gifts.map((g) => [g.id, g])), [gifts])
  const tierOf = useCallback((id: string) => byId.get(id)?.tier ?? null, [byId])
  const [shots, setShots] = useState<Shot[]>([])
  const [picks, setPicks] = useState<Picks>({})
  const [done, setDone] = useState<string | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [dragging, setDragging] = useState(false)
  const keyRef = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setDone(null)
    for (const file of images) {
      const key = ++keyRef.current
      setShots((s) => [...s, { key, name: file.name || 'Pasted screenshot', status: 'reading', matches: [], crops: [] }])
      try {
        const [refs, { pixels, canvas }] = await Promise.all([loadRefs(tierOf), readImage(file)])
        await nextFrame()
        const anchors = findTiles(pixels)
        const matches: TileMatch[] = []
        for (const a of anchors) {
          matches.push(matchTile(pixels, a, refs))
          if (matches.length % 4 === 0) await nextFrame()
        }
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
  }, [tierOf])

  // Paste a screenshot anywhere on the tab (Ctrl+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) { e.preventDefault(); void addFiles(files) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const perShot = shots.filter((s) => s.status === 'done')
    .map((s) => s.matches.map((_, i) => picks[`${s.key}:${i}`]).filter((id): id is string => !!id))
  const merged = mergePicks(perShot, isVestige)
  const newOnes = merged.filter((p) => !owned.includes(p.id) || (isVestige(p.id) && owned.filter((x) => x === p.id).length < p.count))
  const found = shots.reduce((n, s) => n + s.matches.length, 0)

  const apply = (replace: boolean) => {
    const next = applyImport(owned, merged, replace, isVestige)
    onOwnedChange(next)
    const added = replace ? merged.length : newOnes.length
    setDone(replace ? `Gifts you have now holds the ${added} gift${added === 1 ? '' : 's'} from your screenshots.`
      : `Added ${added} gift${added === 1 ? '' : 's'} to Gifts you have.`)
    setConfirmReplace(false)
    setShots([])
    setPicks({})
  }

  return (
    <div className="import-tab">
      <section className="panel import-intro">
        <h2>Import gifts from a screenshot</h2>
        <p className="muted small">
          Take a screenshot of the <b>Owned</b> tab of the E.G.O Gifts screen (the gift button at the top-left during a run),
          or of the <b>Enhance</b> or <b>Fuse</b> screen at a shop. If your gifts don’t all fit, scroll and take another:
          overlapping screenshots are fine. The Clear Rewards, Current Theme Pack-Exclusive and Featured tabs show gifts you
          could get, not ones you have. Your screenshots stay on this device: they’re read here in your browser.
        </p>
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
      </section>

      {shots.map((s, si) => (
        <section key={s.key} className="panel import-shot">
          <header className="panel-head">
            <h2>Screenshot {si + 1} <span className="muted small">{s.name}</span></h2>
            <button className="link-btn" onClick={() => setShots((x) => x.filter((y) => y.key !== s.key))}>Remove</button>
          </header>
          {s.status === 'reading' && <p className="muted small">Reading…</p>}
          {s.status === 'error' && <p className="reason reason-bad small">Couldn’t read this image: {s.error}</p>}
          {s.status === 'done' && s.matches.length === 0 && (
            <p className="reason reason-bad small">
              No gift tiles found. Use the Owned tab, or the Enhance or Fuse screen, and keep the whole grid in the screenshot.
            </p>
          )}
          {s.matches.length > 0 && (
            <ol className="import-tiles">
              {s.matches.map((m, i) => {
                const key = `${s.key}:${i}`
                const pick = picks[key] ?? null
                const g = pick ? byId.get(pick) : undefined
                return (
                  <li key={key} className={`import-tile import-${m.confidence}${pick ? '' : ' import-off'}`}>
                    <img src={s.crops[i]} alt="" width={56} height={56} className="import-crop" />
                    <div className="import-body">
                      <div className="import-top">
                        {g ? <GiftLabel gift={g} icon={28} /> : <span className="muted">Left out</span>}
                        {CONF_LABEL[m.confidence] && <span className={`pill pill-${m.confidence}`}>{CONF_LABEL[m.confidence]}</span>}
                        {g && owned.includes(g.id) && !isVestige(g.id) && <span className="muted small">You have it</span>}
                      </div>
                      <select value={pick ?? ''} aria-label="Which gift is this?"
                        onChange={(e) => setPicks((p) => ({ ...p, [key]: e.target.value || null }))}>
                        {m.candidates.map((c) => (
                          <option key={c.id} value={c.id}>{byId.get(c.id)?.name ?? c.id} ({Math.round(c.score * 100)}%)</option>
                        ))}
                        <option value="">Not a gift / leave it out</option>
                      </select>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      ))}

      {found > 0 && (
        <section className="panel import-apply">
          <p>
            <b>{merged.length}</b> gift{merged.length === 1 ? '' : 's'} picked
            {merged.length > newOnes.length ? `, ${merged.length - newOnes.length} of them already in Gifts you have` : ''}.
            <span className="muted small"> Marked tiles scored under {Math.round(CONFIDENCE.sure * 100)}% or look a lot like another gift: check them against the picture.</span>
          </p>
          <div className="import-buttons">
            <button className="btn" disabled={!newOnes.length} onClick={() => apply(false)}>
              Add {newOnes.length} to Gifts you have
            </button>
            {confirmReplace ? (
              <span className="confirm">
                <span className="small">Replace all {owned.length} gifts you have with these {merged.length}?</span>
                <button className="link-btn danger" onClick={() => apply(true)}>Replace</button>
                <button className="link-btn" onClick={() => setConfirmReplace(false)}>Cancel</button>
              </span>
            ) : (
              <button className="link-btn" disabled={!merged.length} onClick={() => setConfirmReplace(true)}
                title="Use this when your screenshots show every gift you have (the whole Owned list)">
                Replace my gifts with these
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
