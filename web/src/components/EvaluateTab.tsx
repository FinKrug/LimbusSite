import { useMemo, useState } from 'react'
import { evaluateGift, evaluatePack, type Evaluation } from '../lib/evaluate'
import type { RunContext } from '../lib/scoring'
import type { Gift, ThemePack } from '../lib/types'
import { GiftIcon } from './GiftIcon'
import { HowToGet } from './HowToGet'
import { GiftWhy, PackWhy } from './WhyRank'
import { GiftLabel, WikiLink } from './bits'

interface Props {
  ctx: RunContext
  packsForGift: Map<string, ThemePack[]>
}

type Pick = { kind: 'gift'; gift: Gift } | { kind: 'pack'; pack: ThemePack }

const VERDICT = { take: 'Take it', maybe: 'Maybe', skip: 'Skip' }

/** Type a gift or theme pack; get every reason to take or skip it, for your team and run. */
export function EvaluateTab({ ctx, packsForGift }: Props) {
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState<Pick | null>(null)
  const [recent, setRecent] = useState<Pick[]>([])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const gifts: Pick[] = ctx.data.gifts.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 6).map((gift) => ({ kind: 'gift', gift }))
    const packs: Pick[] = ctx.data.themePacks.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4).map((pack) => ({ kind: 'pack', pack }))
    return [...gifts, ...packs]
  }, [query, ctx.data])

  const choose = (p: Pick) => {
    setPick(p)
    setQuery('')
    setRecent((r) => [p, ...r.filter((x) => key(x) !== key(p))].slice(0, 6))
  }

  const result = useMemo(() => {
    if (!pick) return null
    return pick.kind === 'gift' ? { ...evaluateGift(pick.gift, ctx, packsForGift), kind: 'gift' as const } : { ...evaluatePack(pick.pack, ctx), kind: 'pack' as const }
  }, [pick, ctx, packsForGift])

  const run = ctx.run
  return (
    <div className="evaluate">
      <div className="search eval-search">
        <input type="search" placeholder="Type an E.G.O gift or theme pack…" value={query} autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && options[0]) choose(options[0]) }} aria-label="Gift or theme pack to evaluate" />
        {options.length > 0 && (
          <ul className="search-results">
            {options.map((o) => (
              <li key={key(o)} onMouseDown={(e) => { e.preventDefault(); choose(o) }}>
                {o.kind === 'gift' ? <><GiftIcon gift={o.gift} size={22} /><span className="grow">{o.gift.name}</span><span className="tag">gift</span></>
                  : <><span className="grow">{o.pack.name}</span><span className="tag">theme pack</span></>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {recent.length > 1 && (
        <div className="search-options">
          <span className="muted small">Recent</span>
          {recent.map((r) => <button key={key(r)} className="chip-btn" onClick={() => setPick(r)}>{r.kind === 'gift' ? r.gift.name : r.pack.name}</button>)}
        </div>
      )}
      <p className="muted small">
        Judged for your deployed team and your run ({run.difficulty}, {run.floors} floors{run.floor !== null ? `, floor ${run.floor}` : ''}).
        Change the run in the side panel.
      </p>

      {!pick || !result ? (
        <div className="empty">Search for a gift (like White Gossypium or Lunar Memory) or a theme pack (like Spring Cultivation) to see its pros and cons for your team.</div>
      ) : (
        <article className={`card eval-card eval-${result.verdict}`}>
          <header className="eval-head">
            {pick.kind === 'gift' ? <GiftIcon gift={pick.gift} size={72} /> : null}
            <div className="eval-title">
              {pick.kind === 'gift' ? <GiftLabel gift={pick.gift} /> : <WikiLink href={pick.pack.wiki_url}>{pick.pack.name}</WikiLink>}
              <p className="eval-headline"><span className={`verdict verdict-${result.verdict === 'take' ? 'go' : result.verdict}`}>{VERDICT[result.verdict]}</span> {result.headline}</p>
            </div>
          </header>
          <Lists e={result} />
          {pick.kind === 'gift' && result.kind === 'gift' && (
            <>
              <details open><summary>Effect</summary><p className="eval-effect">{pick.gift.effect || 'See the wiki.'}</p>
                {pick.gift.upgrades?.map((u, k) => <p key={k} className="eval-effect effect-upgrade"><b>{'+'.repeat(k + 1)}</b> {u}</p>)}
              </details>
              <div className="card-foot">
                <HowToGet gift={pick.gift} packsForGift={packsForGift} giftsById={ctx.giftsById} owned={ctx.owned} />
                <GiftWhy score={result.score} />
              </div>
            </>
          )}
          {pick.kind === 'pack' && result.kind === 'pack' && result.score && (
            <div className="card-foot"><PackWhy score={result.score} /></div>
          )}
        </article>
      )}
    </div>
  )
}

function Lists({ e }: { e: Evaluation }) {
  return (
    <div className="eval-lists">
      <section>
        <h3 className="reason-good">Pros</h3>
        {e.pros.length ? <ul>{e.pros.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="muted small">Nothing stands out.</p>}
      </section>
      <section>
        <h3 className="reason-bad">Cons</h3>
        {e.cons.length ? <ul>{e.cons.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="muted small">No real downsides for your team.</p>}
      </section>
      {e.notes.length > 0 && (
        <section className="eval-notes">
          <h3>Good to know</h3>
          <ul>{e.notes.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      )}
    </div>
  )
}

function key(p: Pick): string {
  return p.kind === 'gift' ? `g:${p.gift.id}` : `p:${p.pack.id}`
}
