import { createContext, useContext, useMemo, useState } from 'react'
import {
  adviseVariant, eventsForPack, findEvents,
  type ChoiceAdvice, type EventChoice, type EventOutcome, type GameEvent,
} from '../lib/events'
import type { RunContext } from '../lib/scoring'
import type { Identity, ThemePack } from '../lib/types'
import { HowItWorks, SinDot } from './bits'
import { VESTIGE_BY_TIER, addGift, isVestige, removeOne } from '../lib/vestiges'
import bossTips from '../data/boss_tips.json'

interface Props {
  ctx: RunContext
  events: GameEvent[]
  /** Everyone you can send on a check (your whole lineup). */
  team: Identity[]
  pack: ThemePack | null
  /** Gifts you have, so a result's "Got it" can add its gifts. */
  owned?: string[]
  onOwnedChange?: (owned: string[]) => void
  /** "boss": only boss fights' own events (the Boss screen); otherwise the regular "?" events. */
  kind?: 'regular' | 'boss'
}

/** Adds a result's gifts to Gifts you have; returns what was added (a gift you have becomes a Vestige). */
interface GiftAdder {
  add: (ids: string[]) => string[]
  undo: (added: string[]) => void
  name: (id: string) => string
}
const AdderContext = createContext<GiftAdder | null>(null)

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const others = (xs: Identity[]) => xs.length > 4
  ? `${xs.slice(0, 3).map((i) => i.sinner).join(', ')} and ${xs.length - 3} more`
  : xs.map((i) => i.sinner).join(', ')

/**
 * Events tab: type the name of the "?" event you walked into and see which choice
 * is best for your team, which to avoid, and who to send on a check.
 */
export function EventsTab({ ctx, events: allEvents, team, pack, owned, onOwnedChange, kind = 'regular' }: Props) {
  const boss = kind === 'boss'
  const events = useMemo(() => allEvents.filter((e) => !!e.boss === boss), [allEvents, boss])
  const adder = useMemo<GiftAdder | null>(() => (owned && onOwnedChange ? {
    add: (ids) => {
      let next = owned
      const added: string[] = []
      for (const id of ids) {
        const tier = ctx.giftsById.get(id)?.tier ?? null
        added.push(!isVestige(id) && next.includes(id) ? VESTIGE_BY_TIER[tier ?? 1] ?? id : id)
        next = addGift(next, id, tier)
      }
      onOwnedChange(next)
      return added
    },
    undo: (added) => onOwnedChange(added.reduce((o, id) => removeOne(o, id), owned)),
    name: (id) => ctx.giftsById.get(id)?.name ?? id,
  } : null), [owned, onOwnedChange, ctx.giftsById])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const giftName = (id: string) => ctx.giftsById.get(id)?.name
  const inPack = useMemo(() => (pack ? eventsForPack(events, pack) : []), [events, pack])
  // Best match first; among equally good ones, this floor's pack's events (you're likely in one).
  const hits = useMemo(() => {
    const here = new Set(inPack.map((e) => e.id))
    return findEvents(events, q, giftName)
      .sort((a, b) => a.rank - b.rank || Number(here.has(b.event.id)) - Number(here.has(a.event.id)) || a.event.name.localeCompare(b.event.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, q, inPack])
  // On the Boss screen the floor's boss event (if it has one) opens by itself.
  const current = events.find((e) => e.id === picked) ?? (q.trim() ? hits[0]?.event : boss ? inPack[0] : undefined)

  return (
    <AdderContext.Provider value={adder}>
    <div className="events-tab">
      <section className="panel events-search">
        <h2>{boss ? 'Boss fight events' : 'Events'}</h2>
        <p className="muted small">{boss
          ? 'Some bosses stop the fight with an event (a choice that can weaken them). Yours come first when you\'ve picked the floor\'s pack.'
          : 'Type one of the choices on screen (quickest), the event\'s name, or a gift it gives.'}</p>
        <HowItWorks>
          Each choice is judged for your team:
          the gifts it gives (scored like the Shop's; a duplicate becomes a Vestige and a gift your team can't use is
          fusion fuel), Cost, how much it hurts, and whether it weakens the boss. Fights for an extra gift are worth
          it unless you tick "Struggling in fights" in Run settings.
        </HowItWorks>
        <input type="search" placeholder="A choice, the event's name, or a gift…" value={q} autoFocus
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
          {/* The Boss screen lists the floor's boss events above; others come up as you type. */}
          {hits.slice(0, q ? 40 : boss && inPack.length ? 0 : 400).map(({ event: e, matched }) => (
            <li key={e.id}>
              <button className={current?.id === e.id ? 'event-row on' : 'event-row'} onClick={() => setPicked(e.id)}>
                {e.name}{e.boss && <span className="tag">boss</span>}
                {q.trim() && matched && <span className="muted small event-match"> · “{matched}”</span>}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="muted small">No event matches “{q}”.</li>}
        </ul>
      </section>

      <section className="panel event-detail" aria-live="polite">
        {current ? <EventCard key={current.id} event={current} ctx={ctx} team={team}
          focus={hits.find((h) => h.event.id === current.id)?.matched ?? null} />
          : <p className="hint">{boss
            ? pack ? `No boss event is known for ${pack.name}: just fight it.` : 'Pick the floor\'s pack in the bar at the top to see its boss\'s events.'
            : 'Pick an event to see what to choose.'}</p>}
      </section>
    </div>
    </AdderContext.Provider>
  )
}

function EventCard({ event, ctx, team, focus = null }: { event: GameEvent; ctx: RunContext; team: Identity[]; focus?: string | null }) {
  // Open the version whose choice you searched for (a pack page lists several events).
  const has = (cs: EventChoice[]): boolean => cs.some((c) => c.label === focus || has(c.next ?? []))
  const k = focus ? event.variants.findIndex((v) => has(v.choices)) : -1
  const [main, ...others] = k > 0 ? [event.variants[k], ...event.variants.filter((_, j) => j !== k)] : event.variants
  const tip = (bossTips as Record<string, string>)[event.id]
  if (event.boss) {
    // A boss's events happen one after another during the fight: show them all, in order, each
    // with when it comes up and how its choices play out.
    return (
      <article className="event-card">
        <header className="event-head">
          <h2>{event.name}</h2>
          <a href={event.wiki_url} target="_blank" rel="noreferrer" className="small">Wiki ↗</a>
        </header>
        {tip && <p className="event-tip"><span className="event-pick-tag">Do this</span> {tip}</p>}
        {event.variants.map((v, k) => (
          <section key={k} className="event-boss-step">
            <h3>{event.variants.length > 1 ? `${k + 1}. ` : ''}{v.name}</h3>
            <Variant variant={v} ctx={ctx} team={team} open />
          </section>
        ))}
        <p className="muted small">These happen mid-fight; the notes are from the boss's wiki page.</p>
      </article>
    )
  }
  return (
    <article className="event-card">
      <header className="event-head">
        <h2>{event.name}</h2>
        <a href={event.wiki_url} target="_blank" rel="noreferrer" className="small">Wiki ↗</a>
      </header>
      {tip && <p className="event-tip"><span className="event-pick-tag">Do this</span> {tip}</p>}
      {others.length > 0 && main.name && <h3 className="event-variant-name">{main.name}</h3>}
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
      {open && variant.note && <p className="muted small event-note">{variant.note}</p>}
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
  if ((c.sins as string[]).includes('all')) {
    return (
      <p className="event-check small">
        Any-skill check: needs {c.adv}+.{' '}
        {o.best ? <>Send <b>{o.best.sinner}</b>: roughly {Math.round(o.chance * 100)}%.</> : 'No one on your team has good odds.'}
      </p>
    )
  }
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
  if (!o || (!o.text && !o.then)) return null
  const t = o.then
  const sides = t ? (t.retry
    ? [[`Try again (${t.condition || 'while you have tries left'})`, t.pass], ['Out of tries', t.fail]] as const
    : t.check
      ? [[`Then pass the ${t.check.sins.map(cap).join('/')} check`, t.pass], ['Then fail it', t.fail]] as const
      : [[`Then ${Math.round((t.chance ?? 0.5) * 100)}%`, t.pass], [`Or ${100 - Math.round((t.chance ?? 0.5) * 100)}%`, t.fail]] as const)
    : []
  return (
    <>
      {o.text && (
        <p className={`event-outcome small${o.hurts ? ' hurts' : ''}${o.nothing ? ' nothing' : ''}`}>
          {label && <span className="event-outcome-label">{label}:</span>} {o.text.replace(/\n+/g, ' ')}
          {o.gifts.length > 0 && <GotIt gifts={o.gifts} />}
        </p>
      )}
      {t && (
        <div className="event-followup">
          {!o.text && label && <p className="event-outcome small"><span className="event-outcome-label">{label}:</span> a second roll decides what you get.</p>}
          {sides.map(([l, x]) => <Outcome key={l} label={l} o={x} />)}
        </div>
      )}
    </>
  )
}

/** "Got it": adds the result's gifts to Gifts you have, with an undo. */
function GotIt({ gifts }: { gifts: string[] }) {
  const adder = useContext(AdderContext)
  const [added, setAdded] = useState<string[] | null>(null)
  if (!adder) return null
  if (added) {
    return (
      <span className="event-got">
        {' '}✓ Added {gifts.map((id, k) => added[k] === id ? adder.name(id) : `${adder.name(id)} (as a ${adder.name(added[k])}, since you had it)`).join(', ')}{' '}
        <button className="link-btn" onClick={() => { adder.undo(added); setAdded(null) }}>Undo</button>
      </span>
    )
  }
  return (
    <>
      {' '}
      <button className="btn small-btn event-got-btn" onClick={() => setAdded(adder.add(gifts))}
        title="You got this result: add its gifts to Gifts you have (one you already have becomes a Vestige, like in game)">
        Got it
      </button>
    </>
  )
}
