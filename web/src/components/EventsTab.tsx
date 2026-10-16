import { useMemo, useState } from 'react'
import {
  adviseVariant, eventsForPack, searchEvents,
  type ChoiceAdvice, type EventOutcome, type GameEvent,
} from '../lib/events'
import type { RunContext } from '../lib/scoring'
import type { Identity, ThemePack } from '../lib/types'
import { SinDot } from './bits'

interface Props {
  ctx: RunContext
  events: GameEvent[]
  /** Everyone you can send on a check (your whole lineup). */
  team: Identity[]
  pack: ThemePack | null
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const others = (xs: Identity[]) => xs.length > 4
  ? `${xs.slice(0, 3).map((i) => i.sinner).join(', ')} and ${xs.length - 3} more`
  : xs.map((i) => i.sinner).join(', ')

/**
 * Events tab: type the name of the "?" event you walked into and see which choice
 * is best for your team, which to avoid, and who to send on a check.
 */
export function EventsTab({ ctx, events, team, pack }: Props) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const giftName = (id: string) => ctx.giftsById.get(id)?.name
  const hits = useMemo(
    () => searchEvents(events, q, giftName).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, q],
  )
  const inPack = useMemo(() => (pack ? eventsForPack(events, pack.name) : []), [events, pack])
  const current = events.find((e) => e.id === picked) ?? (q.trim() ? hits[0] : undefined)

  return (
    <div className="events-tab">
      <section className="panel events-search">
        <h2>Events</h2>
        <p className="muted small">
          Type the name of the event you walked into (the Abnormality's name, like Drunkard) or a gift it gives. Each
          choice is judged for your team: the gifts it gives (scored like Best gifts), Cost, and how much it hurts.
        </p>
        <input type="search" placeholder="Event name or gift…" value={q} autoFocus
          onChange={(e) => { setQ(e.target.value); setPicked(null) }} aria-label="Search events" />
        {inPack.length > 0 && !q && (
          <div className="events-pack">
            <span className="muted small">In {pack!.name}:</span>
            {inPack.map((e) => (
              <button key={e.id} className={`chip-btn${current?.id === e.id ? ' on' : ''}`} onClick={() => setPicked(e.id)}>{e.name}</button>
            ))}
          </div>
        )}
        <ul className="events-list">
          {hits.slice(0, q ? 40 : 400).map((e) => (
            <li key={e.id}>
              <button className={current?.id === e.id ? 'event-row on' : 'event-row'} onClick={() => setPicked(e.id)}>
                {e.name}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="muted small">No event matches “{q}”.</li>}
        </ul>
      </section>

      <section className="panel event-detail" aria-live="polite">
        {current ? <EventCard key={current.id} event={current} ctx={ctx} team={team} />
          : <p className="hint">Pick an event to see what to choose.</p>}
      </section>
    </div>
  )
}

function EventCard({ event, ctx, team }: { event: GameEvent; ctx: RunContext; team: Identity[] }) {
  const [main, ...others] = event.variants
  return (
    <article className="event-card">
      <header className="event-head">
        <h2>{event.name}</h2>
        <a href={event.wiki_url} target="_blank" rel="noreferrer" className="small">Wiki ↗</a>
      </header>
      <Variant variant={main} ctx={ctx} team={team} open />
      {others.map((v, k) => (
        <details key={k} className="event-variant-other">
          <summary>{v.name}{v.note ? <span className="muted small"> · {v.note}</span> : null}</summary>
          <Variant variant={v} ctx={ctx} team={team} />
        </details>
      ))}
      <p className="muted small">
        Check odds are a rough estimate from your units' skill power; the game shows the exact chance when you pick a
        sinner. Results come from the wiki.
      </p>
    </article>
  )
}

function Variant({ variant, ctx, team, open = false }: {
  variant: GameEvent['variants'][number]; ctx: RunContext; team: Identity[]; open?: boolean
}) {
  const advice = useMemo(() => adviseVariant(variant, ctx, team), [variant, ctx, team])
  const best = advice.find((a) => a.verdict === 'best')
  return (
    <div className="event-variant">
      {open && variant.note && <p className="muted small">{variant.note}</p>}
      {best && (
        <p className="event-pick">
          <span className="event-pick-tag">Pick</span> <b>{best.choice.label}</b>
          {best.then[0] && <> → <b>{best.then[0].choice.label}</b></>}
          {best.odds && !best.odds.luck && best.odds.best && <> · send <b>{best.odds.best.sinner}</b></>}
        </p>
      )}
      <details className="event-story">
        <summary className="muted small">Story</summary>
        <p className="small">{variant.story}</p>
      </details>
      <ol className="event-choices">
        {advice.map((a, k) => <ChoiceRow key={k} a={a} />)}
      </ol>
    </div>
  )
}

function ChoiceRow({ a, nested = false }: { a: ChoiceAdvice; nested?: boolean }) {
  const c = a.choice
  return (
    <li className={`event-choice verdict-${a.verdict}${nested ? ' nested' : ''}`}>
      <div className="event-choice-head">
        <span className="event-choice-label">{c.label || '(choice)'}</span>
        {a.verdict === 'best' && <span className="pill">{nested ? 'Then pick' : '★ Best for your team'}</span>}
        {a.verdict === 'avoid' && <span className="pill warn">Avoid</span>}
      </div>
      {c.desc && <p className="muted small">{c.desc}</p>}
      {c.check && a.odds && <CheckLine a={a} />}
      {c.check ? (
        <>
          <Outcome label="Pass" o={c.pass} />
          <Outcome label="Fail" o={c.fail} />
        </>
      ) : <Outcome o={c.result} />}
      {a.why.length > 0 && (
        <ul className="event-why small">
          {a.why.filter((w) => !w.startsWith('Then:')).slice(0, 4).map((w, k) => <li key={k}>{w}</li>)}
        </ul>
      )}
      {a.unclear && <p className="muted small">The wiki doesn't spell out part of this result; check the wiki page.</p>}
      {a.then.length > 0 && (
        <ol className="event-choices nested-list">
          {a.then.map((t, k) => <ChoiceRow key={k} a={t} nested />)}
        </ol>
      )}
    </li>
  )
}

function CheckLine({ a }: { a: ChoiceAdvice }) {
  const c = a.choice.check!
  const o = a.odds!
  if (o.luck) return <p className="event-check small">Chance-based (no sin check): about a coin flip.</p>
  const sins = c.sins.map((s) => <span key={s} className="event-sin"><SinDot sin={s} />{cap(s)}</span>)
  return (
    <p className="event-check small">
      {sins} check: needs {c.adv}+ with a {c.sins.map(cap).join('/')} skill, {c.disadv}+ without.{' '}
      {o.best
        ? <>Send <b>{o.best.sinner}</b>{o.withSin.includes(o.best) ? ` (has a ${c.sins.map(cap).join('/')} skill)` : ''}: roughly {Math.round(o.chance * 100)}%.</>
        : 'No one on your team has good odds.'}
      {o.withSin.length > 1 && <span className="muted"> Others with the sin: {others(o.withSin.filter((i) => i !== o.best))}.</span>}
      {c.bonuses.length > 0 && <span className="muted"> Bonus: {c.bonuses.map((b) => `${b.mod > 0 ? '+' : ''}${b.mod} for ${b.who}`).join(', ')}.</span>}
    </p>
  )
}

function Outcome({ label, o }: { label?: string; o?: EventOutcome }) {
  if (!o || !o.text) return null
  return (
    <p className={`event-outcome small${o.hurts ? ' hurts' : ''}${o.nothing ? ' nothing' : ''}`}>
      {label && <span className="event-outcome-label">{label}:</span>} {o.text.replace(/\n+/g, ' ')}
    </p>
  )
}
