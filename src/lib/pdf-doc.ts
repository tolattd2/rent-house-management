/**
 * Shared high-quality PDF renderer for print-styled HTML documents (Audit Pack,
 * Reports export, Tenant Statement).
 *
 * Capture the whole document in ONE html2canvas pass (reliable — no region
 * cropping quirks), at the highest scale that still fits the browser's max
 * canvas, then slice that single canvas into A4 pages. Page breaks land at safe
 * boundaries — block edges and after each table row — so a row is never split
 * and nothing is cropped at the page margins. Pages use lossless PNG for crisp
 * text and lines.
 */
export async function renderDocToPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // Highest scale that keeps the canvas within dimension/area limits, so a long
  // document renders (instead of blanking) while staying as sharp as possible.
  const rawW = el.scrollWidth || el.clientWidth || 760
  const rawH = el.scrollHeight || el.clientHeight || 1
  const MAX_DIM = 16384
  const MAX_AREA = 80_000_000
  let SCALE = Math.min(4, MAX_DIM / rawW, MAX_DIM / rawH, Math.sqrt(MAX_AREA / (rawW * rawH)))
  if (!Number.isFinite(SCALE) || SCALE <= 0) SCALE = 1

  const canvas = await html2canvas(el, {
    scale: SCALE,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: rawW,
  })

  const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const MT = 34, MB = 34
  const cpx = canvas.width / pageW                 // canvas px per pt
  const pageContentPx = (pageH - MT - MB) * cpx
  const H = canvas.height

  // Safe page-break positions in canvas px: block edges + after each table row.
  const docTop = el.getBoundingClientRect().top
  const ratio = canvas.height / rawH               // canvas px per CSS px
  const toY = (clientTop: number) => (clientTop - docTop) * ratio
  const cutSet = new Set<number>()
  for (const child of Array.from(el.children)) {
    cutSet.add(toY((child as HTMLElement).getBoundingClientRect().bottom))
  }
  el.querySelectorAll('tr').forEach((tr) => {
    cutSet.add(toY((tr as HTMLElement).getBoundingClientRect().bottom))
  })
  const cuts = Array.from(cutSet).filter((y) => y > 0 && y < H).sort((a, b) => a - b)

  const slices: { start: number; h: number }[] = []
  let start = 0
  let guard = 0
  while (start < H - 1 && guard++ < 6000) {
    let end = Math.min(start + pageContentPx, H)
    if (end < H) {
      let chosen = -1
      for (const c of cuts) {
        if (c > start + 1 && c <= end + 0.5) chosen = c
        else if (c > end) break
      }
      if (chosen > start + 1) end = chosen
    }
    if (end <= start) end = Math.min(start + pageContentPx, H) // never stall
    slices.push({ start, h: end - start })
    start = end
  }

  slices.forEach((s, i) => {
    const band = document.createElement('canvas')
    band.width = canvas.width
    band.height = Math.max(1, Math.ceil(s.h))
    const ctx = band.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, band.width, band.height)
    ctx.drawImage(canvas, 0, s.start, canvas.width, s.h, 0, 0, canvas.width, s.h)
    if (i > 0) pdf.addPage()
    pdf.addImage(band.toDataURL('image/png'), 'PNG', 0, MT, pageW, s.h / cpx, undefined, 'FAST')
  })

  pdf.save(filename.replace(/[^a-z0-9._-]/gi, '_'))
}
