/**
 * Shared high-quality PDF renderer for print-styled HTML documents (Audit Pack,
 * Reports export, Tenant Statement).
 *
 * To stay crisp on long documents without exceeding the browser's max canvas
 * (one huge capture forces the scale down → blurry), we capture in a few large
 * CHUNKS at a fixed high scale. Each chunk is brought into view by translating
 * the document up inside a clipped wrapper and capturing that wrapper — this is
 * reliable (normal CSS rendering) unlike html2canvas's own region-crop, which
 * clipped rows. Each chunk canvas is then sliced into A4 pages at safe
 * boundaries (block edges + after each table row) so nothing is cropped.
 */
export async function renderDocToPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const parent = el.parentElement as HTMLElement | null

  // Measure before applying any transform.
  const docW = el.scrollWidth || el.clientWidth || 760
  const docH = el.scrollHeight || el.clientHeight || 1

  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const MT = 34, MB = 34
  const ptPerPx = pageW / docW
  const pageSlicePx = (pageH - MT - MB) / ptPerPx

  // Safe page-break positions (CSS px from the doc top): block edges + each row.
  const docTop = el.getBoundingClientRect().top
  const cutSet = new Set<number>()
  for (const child of Array.from(el.children)) {
    const r = (child as HTMLElement).getBoundingClientRect()
    cutSet.add(r.top - docTop)      // allow a page to start cleanly before a block (e.g. a section heading)
    cutSet.add(r.bottom - docTop)
  }
  el.querySelectorAll('tr').forEach((tr) => {
    cutSet.add((tr as HTMLElement).getBoundingClientRect().bottom - docTop)
  })
  const cuts = Array.from(cutSet).filter((y) => y > 0 && y <= docH).sort((a, b) => a - b)

  // Page slices (CSS px), each snapped to a safe boundary.
  const pages: { start: number; end: number }[] = []
  let s = 0
  let guard = 0
  while (s < docH - 1 && guard++ < 8000) {
    let e = Math.min(s + pageSlicePx, docH)
    if (e < docH) {
      let chosen = -1
      for (const c of cuts) {
        if (c > s + 1 && c <= e + 0.5) chosen = c
        else if (c > e) break
      }
      if (chosen > s + 1) e = chosen
    }
    if (e <= s) e = Math.min(s + pageSlicePx, docH)
    pages.push({ start: s, end: e })
    s = e
  }
  if (pages.length === 0) pages.push({ start: 0, end: docH })

  // Group pages into chunks that keep each chunk canvas under the canvas limit.
  const SCALE = 4
  const CHUNK_MAX_PX = Math.floor(15000 / SCALE)
  const chunks: { start: number; end: number; pages: { start: number; end: number }[] }[] = []
  for (const pg of pages) {
    const last = chunks[chunks.length - 1]
    if (last && pg.end - last.start <= CHUNK_MAX_PX) {
      last.end = pg.end
      last.pages.push(pg)
    } else {
      chunks.push({ start: pg.start, end: pg.end, pages: [pg] })
    }
  }

  // Save styles we mutate, then bring each chunk into a clipped viewport.
  const savedTransform = el.style.transform
  const savedParent = { overflow: parent?.style.overflow ?? '', height: parent?.style.height ?? '', width: parent?.style.width ?? '' }
  if (parent) {
    parent.style.overflow = 'hidden'
    parent.style.width = `${docW}px`
  }

  try {
    let pageIndex = 0
    for (const chunk of chunks) {
      const chunkH = chunk.end - chunk.start
      el.style.transform = `translateY(${-chunk.start}px)`
      if (parent) parent.style.height = `${chunkH}px`
      const target = parent ?? el
      const canvas = await html2canvas(target, {
        scale: SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: docW,
        height: chunkH,
        windowWidth: docW,
        windowHeight: chunkH,
      })

      for (const pg of chunk.pages) {
        const pgH = pg.end - pg.start
        const srcY = (pg.start - chunk.start) * SCALE
        const srcH = pgH * SCALE
        const band = document.createElement('canvas')
        band.width = canvas.width
        band.height = Math.max(1, Math.ceil(srcH))
        const ctx = band.getContext('2d')
        if (!ctx) continue
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, band.width, band.height)
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)
        if (pageIndex > 0) pdf.addPage()
        pdf.addImage(band.toDataURL('image/png'), 'PNG', 0, MT, pageW, pgH * ptPerPx, undefined, 'FAST')
        pageIndex++
      }
    }
  } finally {
    el.style.transform = savedTransform
    if (parent) {
      parent.style.overflow = savedParent.overflow
      parent.style.height = savedParent.height
      parent.style.width = savedParent.width
    }
  }

  pdf.save(filename.replace(/[^a-z0-9._-]/gi, '_'))
}
