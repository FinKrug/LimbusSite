/**
 * Cost worth keeping when you leave a floor, from the Starlight buffs you took (Finley: "if they get
 * the bonus that you get more Cost at 1000, you should not enhance or buy past a point that would
 * make you lose money unless it's worth enough").
 *
 * Cumulating Starcloud: "When moving to the next Floor, increase current Cost balance by 10% (max
 * 100)" (+: 20%, max 125; ++: 30%, max 150). Holding `keep` = max / rate (1000 / 625 / 500) when you
 * leave gets all of it, and every Cost you spend below that also loses `rate` of a Cost on the next
 * floor. So spending `c` out of `balance` really costs c + starcloudLoss(...), and a buy or upgrade
 * is only worth it below the line if it's still worth it at that price. Nothing to keep on the last
 * floor (there's no next one).
 */
export interface CostKeep {
  /** Cost to leave the floor with to get all of it. */
  keep: number
  rate: number
  /** The most it adds on the next floor. */
  cap: number
  /** "Cumulating Starcloud++". */
  label: string
}

/** Cumulating Starcloud per level (base, +, ++): starter_buffs.json. */
export const STARCLOUD = [{ rate: 0.1, cap: 100 }, { rate: 0.2, cap: 125 }, { rate: 0.3, cap: 150 }]

export function starcloudKeep(buffs: Record<string, number>, run: { floor: number | null; floors: number }): CostKeep | null {
  const level = buffs['cumulating-starcloud'] ?? 0
  const s = STARCLOUD[level - 1]
  if (!s || (run.floor !== null && run.floor >= run.floors)) return null
  return { keep: Math.round(s.cap / s.rate), rate: s.rate, cap: s.cap, label: `Cumulating Starcloud${'+'.repeat(level - 1)}` }
}

/** Cost the next floor's Starcloud bonus loses when you spend `spend` out of `balance`. */
export function starcloudLoss(k: CostKeep, balance: number, spend: number): number {
  return k.rate * (Math.min(balance, k.keep) - Math.min(Math.max(0, balance - spend), k.keep))
}
