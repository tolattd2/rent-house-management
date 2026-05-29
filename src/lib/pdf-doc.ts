/**
 * Shared high-quality PDF renderer for print-styled HTML documents (Audit Pack,
 * Reports export, Tenant Statement).
 *
 * Strategy: capture the document in a few large CHUNKS (each several A4 pages
 * tall, sized to stay under the browser's ~16384px max-canvas limit) at a fixed
 * high scale, then slice each chunk canvas into individual A4 pages. This keeps
 * text/lines/charts crisp (scale 4) AND fast (only a handful of html2canvas
 * passes instead of one-per-page), and never blanks. Page breaks land at safe
 * boundaries — block edges and after each table row — so nothing is cropped.
 */
export async function renderDocToPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const MT = 34, MB = 34

  const docW = el.scrollWidth || el.clientWidth || 760
  const docH = el.scrollHeight || el.clientHeight || 1

  const ptPerPx = pageW / docW
  const pageSlicePx = (pageH - MT - MB) / ptPerPx

  // Safe page-break positions (CSS px from the doc top): block edges + each row.
  const docTop = el.getBoundingClientRect().top
  const cutSet = new Set<number>()
  for (const child of Array.from(el.children)) {
    cutSet.add((child as HTMLElement).getBoundingClientRect().bottom - docTop)
  }
  el.querySelectorAll('tr').forEach((tr) => {
    cutSet.add((tr as HTMLElement).getBoundingClientRect().bottom - docTop)
  })
  const cuts = Array.from(cutSet).filter((y) => y > 0 && y <= docH).sort((a, b) => a - b)

  // Build the page slices (CSS px), snapping each page end to a safe boundary.
  const pages: { start: number; end: number }[] = []
  let s = 0
  let guard = 0
  while (s < docH - 1 && guard++ < 5000) {
    let e = Math.min(s + pageSlicePx, docH)
    if (e < docH) {
      let chosen = -1
      for (const c of cuts) {
        if (c > s + 1 && c <= e + 0.5) chosen = c
        else if (c > e) break
      }
      if (chosen > s + 1) e = chosen
    }
    if (e <= s) e = Math.min(s + pageSlicePx, docH) // never stall
    pages.push({ start: s, end: e })
    s = e
  }
  if (pages.length === 0) pages.push({ start: 0, end: docH })

  // Fixed high scale; group pages into chunks that stay under the canvas limit.
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

  let pageIndex = 0
  for (const chunk of chunks) {
    const canvas = await html2canvas(el, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      x: 0,
      y: chunk.start,
      width: docW,
      height: chunk.end - chunk.start,
      windowWidth: docW,
      windowHeight: docH,
      scrollX: 0,
      scrollY: 0,
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

  pdf.save(filename.replace(/[^a-z0-9._-]/gi, '_'))
}
