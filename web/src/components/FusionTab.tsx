import { useMemo, useState } from 'react'
import {
  FUSION_KEYWORDS, REGULAR_SLOTS, SUPER_SLOTS, fodder, forecast, fusionIdeas, fusionPoints, fusionTier, keywordChance,
  matchRecipe, recipePlans, type FusionIdea,
} from '../lib/fusion'
import { scoreGift, type RunContext, type RunSettings } from '../lib/scoring'
import { addGift, isVestige, removeOne } from '../lib/vestiges'
import { type Gift, type ThemePack, tierLabel } from '../lib/types'
import { GiftIcon } from './GiftIcon'
import { HowToGet } from './HowToGet'
import { GiftLabel, KeywordChip } from './bits'

interface Props {
  ctx: RunContext
  owned: string[]
  onOwnedChange: (owned: string[]) => void
  run: RunSettings
  pack: ThemePack | null
  teamKeywords: string[]
  packsForGift: Map<string, ThemePack[]>
}

type Sort = 'tier' | 'value'

/**
 * The Fuse E.G.O Gift screen, like in game: pick a keyword, put gifts in the
 * slots, see the forecast, then Fuse (which updates the gifts you have). Below it:
 * suggested fusions, recipes you've started, and gifts worth selling or fusing.
 */
export function FusionTab({ ctx, owned, onOwnedChange, run, pack, teamKeywords, packsForGift }: Props) {
  const canSuper = run.difficulty !== 'normal'
  const [superShop, setSuperShop] = useState(false)
  const isSuper = canSuper && superShop
  const slots = isSuper ? SUPER_SLOTS : REGULAR_SLOTS
  const [keyword, setKeyword] = useState<string | null>(teamKeywords[0] ?? null)
  const [bench, setBench] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('tier')
  const [picking, setPicking] = useState(false)
  const [guide, setGuide] = useState(false)

  const byId = ctx.giftsById
  const benchGifts = bench.map((id) => byId.get(id)!).filter(Boolean)
  const left = (id: string) => owned.filter((x) => x === id).length - bench.filter((x) => x === id).length
  const inventory = useMemo(() => {
    const ids = [...new Set(owned)]
    const value = new Map(ids.map((id) => [id, isVestige(id) ? -1 : scoreGift(byId.get(id)!, ctx).score]))
    return ids.map((id) => byId.get(id)!).filter(Boolean).sort((a, b) =>
      sort === 'tier' ? (b.tier ?? 0) - (a.tier ?? 0) || a.name.localeCompare(b.name) : value.get(a.id)! - value.get(b.id)!)
  }, [owned, byId, ctx, sort])

  const recipe = bench.length >= 2 ? matchRecipe(bench, ctx.data.fusions) : null
  const recipeResult = recipe ? byId.get(recipe.result) ?? null : null
  const fc = useMemo(
    () => keyword && bench.length >= 2 && !recipe ? forecast(ctx, keyword, benchGifts, pack, isSuper) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, keyword, bench.join(), pack, isSuper, recipe],
  )
  const points = fusionPoints(benchGifts)
  const tier = bench.length ? fusionTier(points, isSuper) : null

  const add = (id: string) => { if (bench.length < slots && left(id) > 0) setBench([...bench, id]) }
  const removeAt = (k: number) => setBench(bench.filter((_, j) => j !== k))
  const load = (idea: FusionIdea) => {
    setKeyword(idea.keyword)
    if (idea.superShop) setSuperShop(true)
    setBench(idea.ingredients.map((i) => i.gift.id))
    setPicking(false)
    document.querySelector('.fuse-screen')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const fuseInto = (result: Gift) => {
    let next = owned
    for (const id of bench) next = removeOne(next, id)
    onOwnedChange(addGift(next, result.id, result.tier))
    setBench([])
    setPicking(false)
  }

  const ideas = useMemo(() => {
    const kws = [...new Set([...teamKeywords, ...ctx.profile.attackCounts.keys()])].filter((k) =>
      (FUSION_KEYWORDS as readonly string[]).includes(k))
    return fusionIdeas(ctx, owned, kws, pack, isSuper).slice(0, 4)
  }, [ctx, owned, teamKeywords, pack, isSuper])
  const recipes = useMemo(() => recipePlans(ctx, owned), [ctx, owned])
  const spare = useMemo(() => {
    const all = fodder(ctx, [...new Set(owned)])
    const best = Math.max(1, ...all.map((f) => f.value))
    return all.filter((f) => !f.keepFor && (isVestige(f.gift.id) || f.value < best * 0.3))
  }, [ctx, owned])

  const ring = Array.from({ length: SUPER_SLOTS }, (_, k) => k)
  const canFuse = bench.length >= 2 && (recipeResult || (keyword && fc && fc.pool.length))

  return (
    <div className="fusion-tab">
      <section className="fuse-screen" aria-label="Fuse E.G.O Gift">
        <header className="fuse-title">Fuse E.G.O Gift</header>
        <div className="fuse-body">
          <div className="fuse-left">
            <div className="fuse-ring">
              {ring.map((k) => {
                const id = bench[k]
                const locked = k >= slots
                const g = id ? byId.get(id) : undefined
                return (
                  <button key={k} className={`fuse-slot fuse-slot-${k}${locked ? ' locked' : ''}${g ? ' filled' : ''}`}
                    disabled={locked || !g} onClick={() => removeAt(k)}
                    title={locked ? 'Super Shops fuse up to 5 gifts' : g ? `Take out ${g.name}` : 'Empty slot'}
                    aria-label={locked ? 'Locked slot' : g ? `Take out ${g.name}` : 'Empty slot'}>
                    {g && <><GiftIcon gift={g} size={46} /><span className="fuse-tier">{tierLabel(g.tier)}</span></>}
                    {locked && <span className="fuse-lock" aria-hidden="true">🔒</span>}
                  </button>
                )
              })}
              <div className={`fuse-slot fuse-center${recipeResult ? ' recipe' : ''}`} aria-live="polite">
                {recipeResult ? <GiftIcon gift={recipeResult} size={64} />
                  : tier ? <span className="fuse-center-tier">{tierLabel(tier)}</span> : null}
              </div>
            </div>
            <div className="fuse-forecast">
              <span className="fuse-forecast-label">Forecasts</span>
              <span className="fuse-forecast-val">{recipeResult ? 'Recipe' : tier ? `Tier ${tierLabel(tier)}` : '?'}<small> {points ? `${points} pts` : ''}</small></span>
              <span className="fuse-forecast-val">
                {recipeResult ? recipeResult.name : bench.length >= 2 && keyword ? `${Math.round(keywordChance(bench.length) * 100)}% ${keyword}` : '? -'}
              </span>
            </div>
          </div>

          <div className="fuse-right">
            <div className="fuse-tools">
              <button className={guide ? 'fuse-tool on' : 'fuse-tool'} onClick={() => setGuide(!guide)}>Fusion Guide</button>
              {canSuper && (
                <button className={isSuper ? 'fuse-tool on' : 'fuse-tool'} aria-pressed={isSuper}
                  onClick={() => { setSuperShop(!isSuper); if (isSuper) setBench(bench.slice(0, REGULAR_SLOTS)) }}
                  title="Super Shops (Hard floors) fuse up to 5 gifts, with lower tier thresholds">Super Shop</button>
              )}
              <select className="fuse-tool" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
                <option value="tier">By Tier</option>
                <option value="value">Least useful first</option>
              </select>
            </div>
            <div className="fuse-keywords" role="group" aria-label="Keyword">
              {FUSION_KEYWORDS.map((k) => (
                <button key={k} className={keyword === k ? 'fuse-kw on' : 'fuse-kw'} aria-pressed={keyword === k} onClick={() => setKeyword(k)}>
                  <KeywordChip keyword={k} />
                </button>
              ))}
            </div>
            {guide ? (
              <FusionGuide ctx={ctx} owned={owned} onLoad={(ids) => { setBench(ids.slice(0, SUPER_SLOTS)); if (ids.length > REGULAR_SLOTS) setSuperShop(true); setGuide(false) }} />
            ) : !keyword ? (
              <div className="fuse-warn"><span className="fuse-warn-icon" aria-hidden="true">⚠</span>Select a Keyword.</div>
            ) : inventory.length === 0 ? (
              <div className="fuse-warn">You have no gifts to fuse. Add the gifts you have in the side panel.</div>
            ) : (
              <ul className="fuse-inventory">
                {inventory.map((g) => {
                  const n = left(g.id)
                  return (
                    <li key={g.id}>
                      <button className="fuse-item" disabled={n <= 0 || bench.length >= slots} onClick={() => add(g.id)}
                        title={`${g.name} (Tier ${tierLabel(g.tier)})${n <= 0 ? ' — all in the slots' : ''}`}>
                        <GiftIcon gift={g} size={48} />
                        <span className="fuse-tier">{tierLabel(g.tier)}</span>
                        {isVestige(g.id) && <span className="fuse-count">×{n}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
        <footer className="fuse-foot">
          <button className="fuse-btn" onClick={() => { setBench([]); setPicking(false) }} disabled={!bench.length}>✕ Clear</button>
          <button className="fuse-btn primary" disabled={!canFuse}
            onClick={() => recipeResult ? fuseInto(recipeResult) : setPicking(true)}>✓ Fuse</button>
        </footer>
      </section>

      {/* What the fusion gives */}
      {recipeResult ? (
        <section className="panel fuse-result">
          <h3>Recipe fusion</h3>
          <p><GiftLabel gift={recipeResult} icon={28} /></p>
          {recipe?.super_shop && !isSuper && <p className="reason-bad">This recipe needs 5 gifts, so only a Super Shop can fuse it.</p>}
          <p className="muted small">Recipe gifts can only be made this way. Fuse removes the ingredients from your gifts and adds it.</p>
        </section>
      ) : fc && keyword ? (
        <section className="panel fuse-result">
          <h3>{picking ? 'What did you get?' : `Possible results: Tier ${tierLabel(fc.tier)} ${keyword}`}</h3>
          <p className="muted small">
            {Math.round(fc.chance * 100)}% chance of a {keyword} gift ({bench.length} gifts{bench.length < 4 ? '; 4+ gifts make it 99%' : ''}).{' '}
            {fc.pool.length} possible {keyword} gifts; average value for your team {fc.expected.toFixed(1)}.
            {pack && fc.fromPack.length > 0 && <> Your current pack, {pack.name}, adds {fc.fromPack.map((g) => g.gift.name).join(', ')}.</>}
            {!pack && run.floor !== null && ' Pick your current theme pack in Your run: its exclusives can come out of random fusions too.'}
          </p>
          <ul className="fuse-pool">
            {fc.pool.slice(0, picking ? 40 : 8).map((g) => (
              <li key={g.gift.id}>
                {picking
                  ? <button className="fuse-pick" onClick={() => fuseInto(g.gift)}><GiftLabel gift={g.gift} icon={24} link={false} /></button>
                  : <GiftLabel gift={g.gift} icon={24} />}
                {fc.fromPack.includes(g) && <span className="pill">this pack</span>}
                <span className="muted small grow-right">{g.reasons[0]?.text}</span>
              </li>
            ))}
          </ul>
          {picking && <OtherResult ctx={ctx} onPick={fuseInto} onCancel={() => setPicking(false)} />}
        </section>
      ) : null}

      <div className="fuse-columns">
        <section className="panel">
          <h3>Suggested fusions</h3>
          {ideas.length === 0 ? (
            <p className="muted small">Nothing worth fusing yet: none of your spare gifts would add up to something better for your team.</p>
          ) : (
            <ul className="fuse-ideas">
              {ideas.map((idea) => (
                <li key={idea.keyword + idea.ingredients.map((i) => i.gift.id).join()} className="fuse-idea">
                  <div className="fuse-idea-row">
                    {idea.ingredients.map((i, k) => <GiftIcon key={k} gift={i.gift} size={32} />)}
                    <span className="fuse-arrow" aria-hidden="true">→</span>
                    <span className="fuse-idea-out">Tier {tierLabel(idea.forecast.tier)} <KeywordChip keyword={idea.keyword} /></span>
                    <button className="btn" onClick={() => load(idea)}>Load</button>
                  </div>
                  <p className="muted small">
                    {Math.round(idea.forecast.chance * 100)}% {idea.keyword}; gives up {idea.ingredients.map((i) => i.gift.name).join(', ')}
                    {idea.ingredients.every((i) => i.value < 1) ? ', which do little for your team' : ''}.
                    {idea.forecast.fromPack.length > 0 && ` Can roll ${pack?.name}'s ${idea.forecast.fromPack[0].gift.name}.`}
                    {idea.superShop && ' Super Shop.'}
                    {idea.alsoKeywords.length > 0 && ` Also good as ${idea.alsoKeywords.join(' or ')}.`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h3>Recipes you've started</h3>
          {recipes.length === 0 ? (
            <p className="muted small">Own an ingredient of a recipe and it shows up here. Fusion Guide lists them all.</p>
          ) : (
            <ul className="fuse-recipes">
              {recipes.slice(0, 8).map((r) => (
                <li key={r.fusion.result} className={r.ready ? 'ready' : ''}>
                  <div className="fuse-idea-row">
                    <GiftLabel gift={r.result} icon={28} />
                    {r.fusion.super_shop && <span className="pill warn">Super Shop only</span>}
                    {r.ready && <span className="pill">Ready</span>}
                  </div>
                  <p className="small">
                    {r.have.map((g) => <span key={g.id} className="owned-ingredient">{g.name} ✓ </span>)}
                    {r.missing.map((g) => <span key={g.id} className="muted">{g.name} · </span>)}
                    {r.anyMissing > 0 && <span className="muted">+ {r.anyMissing} more Sin Fragment{r.anyMissing > 1 ? 's' : ''}</span>}
                  </p>
                  <p className={r.worthIt ? 'small reason-good' : 'small reason-bad'}>
                    {r.worthIt ? `Worth it: ${r.result.name} beats what you give up` : `The ingredients are worth more to your team than ${r.result.name}`}
                  </p>
                  {r.fusion.super_shop && (
                    <p className="muted small">
                      5 gifts, so only a Super Shop can fuse it. Super Shops only replace shops on Hard floors, with a 3% chance
                      plus 1% per 20 Cost you've spent at shops since the last one.
                    </p>
                  )}
                  {r.missing.slice(0, 2).map((g) => (
                    <div key={g.id} className="fuse-howto"><span className="muted small">{g.name}:</span>
                      <HowToGet gift={g} packsForGift={packsForGift} giftsById={byId} owned={ctx.owned} /></div>
                  ))}
                  {r.ready && <button className="btn" onClick={() => {
                    const ids = [...r.fusion.ingredients]
                    if (r.fusion.any_of) ids.push(...r.fusion.any_of.from.filter((i) => owned.includes(i)).slice(0, r.fusion.any_of.count))
                    setBench(ids); if (ids.length > REGULAR_SLOTS) setSuperShop(true)
                    document.querySelector('.fuse-screen')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}>Load</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h3>Sell or fuse these</h3>
          {spare.length === 0 ? (
            <p className="muted small">All your gifts are pulling their weight.</p>
          ) : (
            <ul className="fuse-spare">
              {spare.map((f) => (
                <li key={f.gift.id}>
                  <GiftLabel gift={f.gift} icon={24} link={false} />
                  <span className="muted small grow-right">
                    {isVestige(f.gift.id) ? `×${owned.filter((x) => x === f.gift.id).length} · only good for selling or fusing` : 'does little for your team'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {fodder(ctx, [...new Set(owned)]).some((f) => f.keepFor) && (
            <>
              <h4 className="muted small">Keep</h4>
              <ul className="fuse-spare">
                {fodder(ctx, [...new Set(owned)]).filter((f) => f.keepFor).map((f) => (
                  <li key={f.gift.id}><GiftLabel gift={f.gift} icon={24} link={false} /><span className="muted small grow-right">{f.keepFor}</span></li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** Every recipe, like the in-game Fusion Guide; ones you can make now first. */
function FusionGuide({ ctx, owned, onLoad }: { ctx: RunContext; owned: string[]; onLoad: (ids: string[]) => void }) {
  const [q, setQ] = useState('')
  const rows = ctx.data.fusions
    .map((f) => {
      const result = ctx.giftsById.get(f.result)
      const ing = f.ingredients.map((i) => ctx.giftsById.get(i)).filter((g): g is Gift => !!g)
      const have = ing.filter((g) => owned.includes(g.id)).length
      return { f, result, ing, have }
    })
    .filter((r) => r.result && (!q || [r.result, ...r.ing].some((g) => g!.name.toLowerCase().includes(q.toLowerCase()))))
    .sort((a, b) => b.have / b.ing.length - a.have / a.ing.length || a.result!.name.localeCompare(b.result!.name))
  return (
    <div className="fuse-guide">
      <input type="search" placeholder="Search recipes…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul>
        {rows.map(({ f, result, ing, have }) => (
          <li key={f.result}>
            <span className="fuse-guide-ing">
              {ing.map((g) => <span key={g.id} className={owned.includes(g.id) ? 'have' : ''} title={g.name}><GiftIcon gift={g} size={26} /></span>)}
              {f.any_of && <span className="muted small">+{f.any_of.count} Sin Fragments</span>}
            </span>
            <span aria-hidden="true">→</span>
            <GiftLabel gift={result!} icon={26} link={false} />
            {f.super_shop && <span className="pill warn">Super Shop</span>}
            {have === ing.length && !f.any_of && <button className="btn small-btn" onClick={() => onLoad(f.ingredients)}>Load</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** After a random fusion: search for what you got if it's not in the list. */
function OtherResult({ ctx, onPick, onCancel }: { ctx: RunContext; onPick: (g: Gift) => void; onCancel: () => void }) {
  const [q, setQ] = useState('')
  const hits = q.trim().length < 2 ? [] : ctx.data.gifts.filter((g) => g.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
  return (
    <div className="fuse-other">
      <input type="search" placeholder="Got something else? Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul>{hits.map((g) => <li key={g.id}><button className="fuse-pick" onClick={() => onPick(g)}><GiftLabel gift={g} icon={22} link={false} /></button></li>)}</ul>
      <button className="link-btn" onClick={onCancel}>Cancel</button>
    </div>
  )
}
