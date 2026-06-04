import type { Slide, TextLayout, TextPosition, LogoPosition } from '../types'

export function defaultLayout(hasImage: boolean): TextLayout {
  if (hasImage) {
    return { title: { x: 5, y: 72 }, body: { x: 5, y: 82 }, logoPos: { x: 5, y: 5, size: 20 } }
  }
  return { title: { x: 8, y: 65 }, body: { x: 8, y: 78 }, logoPos: { x: 5, y: 5, size: 20 } }
}

export function loadImageForCanvas(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  for (const line of text.split('\n')) {
    let current = ''
    for (const word of line.split(' ')) {
      const test = current ? `${current} ${word}` : word
      if (ctx.measureText(test).width > maxWidth && current) {
        ctx.fillText(current, x, y)
        current = word
        y += lineHeight
      } else {
        current = test
      }
    }
    ctx.fillText(current, x, y)
    y += lineHeight
  }
}

export async function renderSlideToBlob(
  slide: Slide,
  layout: TextLayout,
  logoUrl: string | null,
): Promise<Blob> {
  const SIZE = 1080
  const SCALE = SIZE / 384
  const imagePosition = layout.imagePosition ?? 'center'

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!

  if (slide.image_url) {
    try {
      const img = await loadImageForCanvas(slide.image_url)
      const s = Math.max(SIZE / img.width, SIZE / img.height)
      const w = img.width * s
      const h = img.height * s
      let dx = (SIZE - w) / 2
      let dy = (SIZE - h) / 2
      if (imagePosition === 'left') dx = 0
      else if (imagePosition === 'right') dx = SIZE - w
      ctx.drawImage(img, dx, dy, w, h)
    } catch {
      const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
      grad.addColorStop(0, '#18181b'); grad.addColorStop(1, '#09090b')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE)
    }
    if (slide.title || slide.text_content) {
      const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(0.5, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.7)')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE)
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, SIZE)
    grad.addColorStop(0, '#18181b'); grad.addColorStop(1, '#09090b')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE)
  }

  if (slide.title && layout.title) {
    const x = (layout.title.x / 100) * SIZE
    const y = (layout.title.y / 100) * SIZE
    const fs = (layout.titleSize ?? 14) * SCALE
    ctx.font = `600 ${fs}px sans-serif`
    ctx.fillStyle = layout.titleColor || '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6
    ctx.fillText(slide.title, x, y)
    ctx.shadowBlur = 0
  }

  if (slide.text_content && layout.body) {
    const x = (layout.body.x / 100) * SIZE
    const y = (layout.body.y / 100) * SIZE
    const fs = (layout.bodySize ?? 11) * SCALE
    ctx.font = `${fs}px sans-serif`
    ctx.fillStyle = layout.bodyColor || '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4
    wrapCanvasText(ctx, slide.text_content, x, y, SIZE * 0.88, fs * 1.5)
    ctx.shadowBlur = 0
  }

  if (logoUrl && layout.logoPos) {
    try {
      const logo = await loadImageForCanvas(logoUrl)
      const logoW = (layout.logoPos.size / 100) * SIZE
      const logoH = logoW * (logo.height / logo.width)
      ctx.drawImage(logo, (layout.logoPos.x / 100) * SIZE, (layout.logoPos.y / 100) * SIZE, logoW, logoH)
    } catch { /* logo load 실패 시 skip */ }
  }

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.92),
  )
}

// suppress unused import warnings for types used only in JSDoc
export type { TextPosition, LogoPosition }
