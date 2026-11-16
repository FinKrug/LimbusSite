/** A shop price: what you pay, with the list price struck through when a gift you have lowers it (Wealth). */
export function Price({ list, pay }: { list: number; pay: number }) {
  return (
    <span className="price">
      {pay !== list && <s className="muted">{list}</s>} <b className={pay !== list ? 'price-off' : undefined}>{pay}</b> Cost
    </span>
  )
}
