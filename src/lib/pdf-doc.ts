/**
 * Shared high-quality PDF renderer for print-styled HTML documents (Audit Pack,
 * Reports export, Tenant Statement). Captures an off-screen, print-styled
 * element at high resolution then paginates onto A4 with margins, breaking pages
 * at safe boundaries — block edges AND after each table row — so long tables are
 * never sliced mid-row (which would let the page margins crop the data).
 */
export async function renderDocToPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
  const SCALE = 4
  const canvas = await html2canvas(el, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, windowWidth: el.scrollWidth })
  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const MT = 34, MB = 34
  const cpx = canvas.width / pageW
  const pageContentPx = (pageH - MT - MB) * cpx
  const H = canvas.height
  const docTop = el.getBoundingClientRect().top
  const ratio = canvas.height / el.scrollHeight
  const toY = (clientTop: number) => (clientTop - docTop) * ratio

  // Safe page-break positions: between top-level blocks AND after each table row.
  const cutSet = new Set<number>()
  for (const child of Array.from(el.children)) {
    const r = (child as HTMLElement).getBoundingClientRect()
    cutSet.add(toY(r.top))
    cutSet.add(toY(r.bottom))
  }
  el.querySelectorAll('tr').forEach((tr) => {
    cutSet.add(toY((tr as HTMLElement).getBoundingClientRect().bottom))
  })
  const cuts = Array.from(cutSet).filter((y) => y > 0 && y < H).sort((a, b) => a - b)

  const slices: { start: number; h: number }[] = []
  let start = 0
  let guard = 0
  while (start < H - 1 && guard++ < 4000) {
    let end = Math.min(start + pageContentPx, H)
    if (end < H) {
      let chosen = -1
      for (const c of cuts) {
        if (c > start + 1 && c <= end + 0.5) chosen = c
        else if (c > end) break
      }
      if (chosen > start + 1) end = chosen
    }
    slices.push({ start, h: end - start })
    start = end
  }

  slices.forEach((s, i) => {
    const band = document.createElement('canvas')
    band.width = canvas.width
    band.height = Math.ceil(s.h)
    const ctx = band.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, band.width, band.height)
    ctx.drawImage(canvas, 0, s.start, canvas.width, s.h, 0, 0, canvas.width, s.h)
    if (i > 0) pdf.addPage()
    pdf.addImage(band.toDataURL('image/jpeg', 0.85), 'JPEG', 0, MT, pageW, s.h / cpx, undefined, 'FAST')
  })
  pdf.save(filename.replace(/[^a-z0-9._-]/gi, '_'))
}
