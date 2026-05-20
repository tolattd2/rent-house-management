'use client'

import { useRef, useEffect, useState, type ReactNode } from 'react'

/**
 * Wraps a wide/tall data table in a bounded scroll box and adds a second
 * horizontal scrollbar pinned above the table, kept in sync with the table's
 * own horizontal scroll. The top bar hides itself when the table fits.
 */
export function TableScroll({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const update = () => {
      setWidth(body.scrollWidth)
      setOverflowing(body.scrollWidth - body.clientWidth > 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(body)
    const table = body.querySelector('table')
    if (table) ro.observe(table)
    return () => ro.disconnect()
  }, [])

  const sync = (src: HTMLDivElement | null, dst: HTMLDivElement | null) => {
    if (src && dst && dst.scrollLeft !== src.scrollLeft) dst.scrollLeft = src.scrollLeft
  }

  return (
    <>
      <div
        ref={topRef}
        className="table-scroll-top"
        style={overflowing ? undefined : { display: 'none' }}
        onScroll={() => sync(topRef.current, bodyRef.current)}
        aria-hidden="true"
      >
        <div style={{ width: width || 1, height: 1 }} />
      </div>
      <div
        ref={bodyRef}
        className="table-scroll"
        onScroll={() => sync(bodyRef.current, topRef.current)}
      >
        {children}
      </div>
    </>
  )
}
