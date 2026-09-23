import type { FusionPlan } from '../lib/scoring'
import { Empty, GiftLabel, Reasons } from './bits'

const HEADINGS = {
  ready: 'Ready to fuse',
  close: 'One gift away',
  started: 'Started',
}

export function FusionList({ plans }: { plans: FusionPlan[] }) {
  if (plans.length === 0) {
    return (
      <Empty>
        No fusions in progress. Once you add a gift that’s an ingredient in a fusion recipe,
        it shows up here with advice on whether to fuse or keep the ingredients.
      </Empty>
    )
  }
  return (
    <div>
      {(['ready', 'close', 'started'] as const).map((status) => {
        const group = plans.filter((p) => p.status === status)
        if (!group.length) return null
        return (
          <section key={status} className="group">
            <h3>{HEADINGS[status]} <span className="count">{group.length}</span></h3>
            <ol className="cards">
              {group.map((p) => (
                <li key={p.result.id} className={`card card-${p.verdict === 'craft' ? 'go' : 'skip'}`}>
                  <div className="card-main">
                    <span className="gift-label">
                      <span className={`verdict verdict-${p.verdict === 'craft' ? 'go' : 'skip'}`}>
                        {p.verdict === 'craft' ? (status === 'ready' ? 'Fuse' : 'Worth it') : 'Keep'}
                      </span>
                      <GiftLabel gift={p.result} />
                    </span>
                  </div>
                  <Reasons reasons={p.reasons} />
                  <ul className="ingredients">
                    {p.owned.map((g) => (
                      <li key={g.id} className="have"><span aria-label="have">✓</span><GiftLabel gift={g} link={false} /></li>
                    ))}
                    {p.missing.map((g) => (
                      <li key={g.id} className="need"><span aria-label="missing">✗</span><GiftLabel gift={g} /></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
