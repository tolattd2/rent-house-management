/**
 * Shared high-quality PDF renderer for print-styled HTML documents (Audit Pack,
 * Reports export, Tenant Statement).
 *
 * Instead of rasterising the whole (potentially very tall) document in one shot
 * — which forces the scale down on long docs and blurs everything, or blanks
 * when it exceeds the browser's ~16384px max canvas — we capture ONE A4 page at
 * a time at a fixed high scale. Each slice is only a page tall, so it stays well
 * within canvas limits and the text/lines/chart stay crisp regardless of how
 * long the document is. Page breaks land at safe boundaries (block edges and
 * after each table row) so nothing is cropped at the margins.
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

  // pt per CSS px when the doc width is scaled to the printable page width, and
  // how many CSS px of the document fit in one page's content height.
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

  // Fixed high scale → each one-page slice is small enough to stay crisp.
  const SCALE = 4

  let startPx = 0
  let page = 0
  let guard = 0
  while (startPx < docH - 1 && guard++ < 4000) {
    let endPx = Math.min(startPx + pageSlicePx, docH)
    if (endPx < docH) {
      let chosen = -1
      for (const c of cuts) {
        if (c > startPx + 1 && c <= endPx + 0.5) chosen = c
        else if (c > endPx) break
      }
      if (chosen > startPx + 1) endPx = chosen
    }
    const sliceH = endPx - startPx
    if (sliceH < 1) break

    const canvas = await html2canvas(el, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      x: 0,
      y: startPx,
      width: docW,
      height: sliceH,
      windowWidth: docW,
      windowHeight: docH,
      scrollX: 0,
      scrollY: 0,
    })

    if (page > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, MT, pageW, sliceH * ptPerPx, undefined, 'FAST')
    page++
    startPx = endPx
  }

  pdf.save(filename.replace(/[^a-z0-9._-]/gi, '_'))
}
