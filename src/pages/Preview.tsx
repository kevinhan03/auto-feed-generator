import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Slide, TextLayout, TextPosition, LogoPosition } from '../types'

type PostMeta = { caption: string | null; hashtags: string[] | null; brands: { brand_name: string } | null; logo_url: string | null }

// 기본 위치 (이미지 없을 때 / 이미지 있을 때 구분)
function defaultLayout(hasImage: boolean): TextLayout {
  if (hasImage) {
    return { title: { x: 5, y: 72 }, body: { x: 5, y: 82 }, logoPos: { x: 5, y: 5, size: 20 } }
  }
  return { title: { x: 8, y: 65 }, body: { x: 8, y: 78 }, logoPos: { x: 5, y: 5, size: 20 } }
}

// hex 문자열 유효성 검사 (#fff, #ffffff, fff, ffffff 모두 수용 → #xxxxxx 반환)
function parseHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return '#' + s.split('').map(c => c + c).join('')
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s
  return null
}

// 드래그 가능한 텍스트 요소
function DraggableText({
  text,
  pos,
  color,
  fontSize,
  onMove,
  className,
  containerRef,
  editMode,
  label,
}: {
  text: string
  pos: TextPosition
  color?: string
  fontSize?: number
  onMove: (p: TextPosition) => void
  className: string
  containerRef: React.RefObject<HTMLDivElement | null>
  editMode: boolean
  label: string
}) {
  const dragging = useRef(false)
  const startMouse = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })

  const getContainerRect = () => containerRef.current?.getBoundingClientRect()

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editMode) return
    e.preventDefault()
    dragging.current = true
    startMouse.current = { x: e.clientX, y: e.clientY }
    startPos.current = { x: pos.x, y: pos.y }

    const onMove = (me: MouseEvent) => {
      if (!dragging.current) return
      const rect = getContainerRect()
      if (!rect) return
      const dx = ((me.clientX - startMouse.current.x) / rect.width) * 100
      const dy = ((me.clientY - startMouse.current.y) / rect.height) * 100
      const nx = Math.min(95, Math.max(0, startPos.current.x + dx))
      const ny = Math.min(95, Math.max(0, startPos.current.y + dy))
      onMoveRef.current({ x: nx, y: ny })
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [editMode, pos])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!editMode) return
    const touch = e.touches[0]
    dragging.current = true
    startMouse.current = { x: touch.clientX, y: touch.clientY }
    startPos.current = { x: pos.x, y: pos.y }

    const onMove = (te: TouchEvent) => {
      if (!dragging.current) return
      const rect = getContainerRect()
      if (!rect) return
      const t = te.touches[0]
      const dx = ((t.clientX - startMouse.current.x) / rect.width) * 100
      const dy = ((t.clientY - startMouse.current.y) / rect.height) * 100
      const nx = Math.min(95, Math.max(0, startPos.current.x + dx))
      const ny = Math.min(95, Math.max(0, startPos.current.y + dy))
      onMoveRef.current({ x: nx, y: ny })
    }
    const onEnd = () => {
      dragging.current = false
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
  }, [editMode, pos])

  // onMove를 ref로 유지해 클로저 stale 방지
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, position: 'absolute', maxWidth: '90%' }}
      className={`
        ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}
        ${editMode ? 'outline outline-1 outline-dashed outline-white/30 rounded px-1 py-0.5' : ''}
        select-none
      `}
      title={editMode ? `${label} — 드래그로 위치 변경` : undefined}
    >
      <span className={className} style={{ ...(color ? { color } : {}), ...(fontSize ? { fontSize } : {}) }}>{text}</span>
    </div>
  )
}

// ─── DraggableLogo ────────────────────────────────────────────────────────────

function DraggableLogo({
  src,
  pos,
  onMove,
  onSizeChange,
  containerRef,
  editMode,
}: {
  src: string
  pos: LogoPosition
  onMove: (p: LogoPosition) => void
  onSizeChange: (size: number) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  editMode: boolean
}) {
  const dragging = useRef(false)
  const startMouse = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  const getRect = () => containerRef.current?.getBoundingClientRect()

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editMode) return
    e.preventDefault()
    dragging.current = true
    startMouse.current = { x: e.clientX, y: e.clientY }
    startPos.current = { x: pos.x, y: pos.y }

    const onMouseMove = (me: MouseEvent) => {
      if (!dragging.current) return
      const rect = getRect()
      if (!rect) return
      const dx = ((me.clientX - startMouse.current.x) / rect.width) * 100
      const dy = ((me.clientY - startMouse.current.y) / rect.height) * 100
      onMoveRef.current({
        ...pos,
        x: Math.min(95, Math.max(0, startPos.current.x + dx)),
        y: Math.min(95, Math.max(0, startPos.current.y + dy)),
      })
    }
    const onMouseUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [editMode, pos])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!editMode) return
    const touch = e.touches[0]
    dragging.current = true
    startMouse.current = { x: touch.clientX, y: touch.clientY }
    startPos.current = { x: pos.x, y: pos.y }

    const onTouchMove = (te: TouchEvent) => {
      if (!dragging.current) return
      const rect = getRect()
      if (!rect) return
      const t = te.touches[0]
      const dx = ((t.clientX - startMouse.current.x) / rect.width) * 100
      const dy = ((t.clientY - startMouse.current.y) / rect.height) * 100
      onMoveRef.current({
        ...pos,
        x: Math.min(95, Math.max(0, startPos.current.x + dx)),
        y: Math.min(95, Math.max(0, startPos.current.y + dy)),
      })
    }
    const onTouchEnd = () => {
      dragging.current = false
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
  }, [editMode, pos])

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, position: 'absolute', width: `${pos.size}%` }}
      className={`
        ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}
        ${editMode ? 'outline outline-1 outline-dashed outline-white/40 rounded' : ''}
        select-none
      `}
      title={editMode ? '로고 — 드래그로 위치 변경' : undefined}
    >
      <img src={src} alt="logo" className="w-full h-auto object-contain drop-shadow" draggable={false} />
      {/* 크기 조절 핸들 (편집 모드) */}
      {editMode && (
        <div
          className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full cursor-se-resize"
          onMouseDown={e => {
            e.stopPropagation()
            e.preventDefault()
            const rect = getRect()
            if (!rect) return
            const startX = e.clientX
            const startSize = pos.size
            const onResize = (me: MouseEvent) => {
              const dx = ((me.clientX - startX) / rect.width) * 100
              onSizeChange(Math.min(80, Math.max(5, startSize + dx)))
            }
            const onUp = () => {
              window.removeEventListener('mousemove', onResize)
              window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onResize)
            window.addEventListener('mouseup', onUp)
          }}
        />
      )}
    </div>
  )
}

export default function Preview() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const postId = searchParams.get('postId')

  const [slides, setSlides] = useState<Slide[]>([])
  const [post, setPost] = useState<PostMeta | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  // 레이아웃 편집 모드
  const [editMode, setEditMode] = useState(false)
  const [layouts, setLayouts] = useState<Record<string, TextLayout>>({})
  const [savingLayout, setSavingLayout] = useState(false)
  const [layoutSaved, setLayoutSaved] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!postId) { setLoading(false); return }

    Promise.all([
      supabase.from('slides').select('*').eq('post_id', postId).order('slide_number'),
      supabase.from('posts').select('caption, hashtags, logo_url, brands(brand_name)').eq('id', postId).single(),
    ]).then(([slidesRes, postRes]) => {
      if (slidesRes.data) {
        const data = slidesRes.data as Slide[]
        setSlides(data)
        // 저장된 레이아웃 초기화
        const initial: Record<string, TextLayout> = {}
        for (const s of data) {
          initial[s.id] = s.text_layout ?? defaultLayout(!!s.image_url)
        }
        setLayouts(initial)
      }
      if (postRes.data) setPost(postRes.data as unknown as PostMeta)
      setLoading(false)
    })
  }, [postId])

  const prev = () => setCurrentIndex(i => Math.max(0, i - 1))
  const next = () => setCurrentIndex(i => Math.min(slides.length - 1, i + 1))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev()
    if (e.key === 'ArrowRight') next()
    if (e.key === 'Escape') setEditMode(false)
  }

  const updatePos = useCallback((slideId: string, field: 'title' | 'body', pos: TextPosition) => {
    setLayouts(prev => ({
      ...prev,
      [slideId]: { ...prev[slideId], [field]: pos },
    }))
  }, [])

  const updateColor = useCallback((slideId: string, field: 'titleColor' | 'bodyColor', hex: string) => {
    setLayouts(prev => ({
      ...prev,
      [slideId]: { ...prev[slideId], [field]: hex },
    }))
  }, [])

  const updateSize = useCallback((slideId: string, field: 'titleSize' | 'bodySize', size: number) => {
    setLayouts(prev => ({
      ...prev,
      [slideId]: { ...prev[slideId], [field]: size },
    }))
  }, [])

  const updateLogoPos = useCallback((slideId: string, logoPos: LogoPosition) => {
    setLayouts(prev => ({
      ...prev,
      [slideId]: { ...prev[slideId], logoPos },
    }))
  }, [])

  const handleSaveLayout = useCallback(async () => {
    if (!slides.length) return
    setSavingLayout(true)
    const updates = slides.map(s => ({
      id: s.id,
      slide_number: s.slide_number,
      text_layout: layouts[s.id] ?? null,
      updated_at: new Date().toISOString(),
    }))
    await supabase.from('slides').upsert(updates)
    setSavingLayout(false)
    setLayoutSaved(true)
    setTimeout(() => setLayoutSaved(false), 2000)
  }, [slides, layouts])

  const handleResetLayout = useCallback(() => {
    const slide = slides[currentIndex]
    if (!slide) return
    setLayouts(prev => ({
      ...prev,
      [slide.id]: defaultLayout(!!slide.image_url),
    }))
  }, [slides, currentIndex])

  if (!postId) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
        URL에 postId 파라미터가 필요합니다.
      </div>
    )
  }
  if (loading) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
        불러오는 중...
      </div>
    )
  }
  if (slides.length === 0) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
        슬라이드가 없습니다.
      </div>
    )
  }

  const slide = slides[currentIndex]
  const brandName = post?.brands?.brand_name ?? ''
  const rawLayout = layouts[slide.id] ?? defaultLayout(!!slide.image_url)
  // 로고가 있는데 logoPos가 없으면 기본값 주입
  const layout: TextLayout = post?.logo_url && !rawLayout.logoPos
    ? { ...rawLayout, logoPos: defaultLayout(!!slide.image_url).logoPos }
    : rawLayout
  const titlePos = layout.title ?? defaultLayout(!!slide.image_url).title!
  const bodyPos = layout.body ?? defaultLayout(!!slide.image_url).body!

  return (
    <div
      className="min-h-screen bg-zinc-950 text-white flex flex-col"
      onKeyDown={handleKey}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* 헤더 */}
      <header className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="text-zinc-500 hover:text-white text-sm transition-colors"
          >
            ← 뒤로
          </button>
          <span className="text-zinc-700 text-sm">|</span>
          <span className="text-white text-sm font-medium">미리보기</span>
        </div>
        <div className="flex items-center gap-2">
          {layoutSaved && <span className="text-green-400 text-xs">임시저장 완료</span>}
          {editMode && (
            <>
              <button
                onClick={handleResetLayout}
                className="px-3 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
              >
                초기화
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-md transition-colors"
              >
                완료
              </button>
            </>
          )}
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
            >
              텍스트 배치
            </button>
          )}
          <button
            onClick={handleSaveLayout}
            disabled={savingLayout}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md
              disabled:opacity-40 transition-colors"
          >
            {savingLayout ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={() => navigate(`/slide-editor?postId=${postId}`)}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
          >
            편집하기
          </button>
        </div>
      </header>

      {/* 편집 모드 패널 */}
      {editMode && (
        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 space-y-2">
          <p className="text-zinc-500 text-xs">텍스트를 드래그해 위치를 변경하세요.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {/* 제목 */}
            <div className="flex items-center gap-3">
              <span className="text-zinc-400 text-xs w-6">제목</span>
              <ColorInput
                label="색상"
                value={layouts[slides[currentIndex]?.id]?.titleColor ?? ''}
                onChange={hex => updateColor(slides[currentIndex].id, 'titleColor', hex)}
              />
              <FontSizeInput
                value={layouts[slides[currentIndex]?.id]?.titleSize ?? 14}
                onChange={size => updateSize(slides[currentIndex].id, 'titleSize', size)}
              />
            </div>
            {/* 본문 */}
            <div className="flex items-center gap-3">
              <span className="text-zinc-400 text-xs w-6">본문</span>
              <ColorInput
                label="색상"
                value={layouts[slides[currentIndex]?.id]?.bodyColor ?? ''}
                onChange={hex => updateColor(slides[currentIndex].id, 'bodyColor', hex)}
              />
              <FontSizeInput
                value={layouts[slides[currentIndex]?.id]?.bodySize ?? 11}
                onChange={size => updateSize(slides[currentIndex].id, 'bodySize', size)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 본문 */}
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          {/* 프로필 행 */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
              P
            </div>
            <div>
              <p className="text-white text-xs font-semibold leading-tight">pyeonzipshop</p>
              {brandName && <p className="text-zinc-500 text-xs leading-tight">{brandName}</p>}
            </div>
          </div>

          {/* 슬라이드 캔버스 (1:1) */}
          <div
            ref={canvasRef}
            className="relative w-full aspect-square bg-zinc-900 rounded-sm overflow-hidden select-none"
          >
            {/* 배경 */}
            {slide.image_url ? (
              <img
                src={slide.image_url}
                alt={slide.title ?? ''}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-b from-zinc-900 to-zinc-950" />
            )}

            {/* 그라디언트 오버레이 (이미지 있을 때) */}
            {slide.image_url && (slide.title || slide.text_content) && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
            )}

            {/* 제목 — 드래그 가능 */}
            {slide.title && (
              <DraggableText
                text={slide.title}
                pos={titlePos}
                color={layout.titleColor}
                fontSize={layout.titleSize}
                onMove={p => updatePos(slide.id, 'title', p)}
                containerRef={canvasRef}
                editMode={editMode}
                label="제목"
                className="font-semibold leading-snug drop-shadow"
              />
            )}

            {/* 본문 — 드래그 가능 */}
            {slide.text_content && (
              <DraggableText
                text={slide.text_content}
                pos={bodyPos}
                color={layout.bodyColor}
                fontSize={layout.bodySize}
                onMove={p => updatePos(slide.id, 'body', p)}
                containerRef={canvasRef}
                editMode={editMode}
                label="본문"
                className="leading-relaxed drop-shadow whitespace-pre-wrap"
              />
            )}

            {/* 로고 — 드래그 가능 */}
            {post?.logo_url && layout.logoPos && (
              <DraggableLogo
                src={post.logo_url}
                pos={layout.logoPos}
                onMove={p => updateLogoPos(slide.id, p)}
                onSizeChange={size => updateLogoPos(slide.id, { ...layout.logoPos!, size })}
                containerRef={canvasRef}
                editMode={editMode}
              />
            )}

            {/* 슬라이드 번호 뱃지 */}
            <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none">
              {currentIndex + 1} / {slides.length}
            </div>
          </div>

          {/* 내비게이션 */}
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={prev}
              disabled={currentIndex === 0}
              className="p-2 text-zinc-500 hover:text-white disabled:opacity-20 transition-colors"
            >
              ‹
            </button>
            <div className="flex gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`rounded-full transition-all ${
                    i === currentIndex
                      ? 'w-4 h-1.5 bg-white'
                      : 'w-1.5 h-1.5 bg-zinc-600 hover:bg-zinc-400'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={next}
              disabled={currentIndex === slides.length - 1}
              className="p-2 text-zinc-500 hover:text-white disabled:opacity-20 transition-colors"
            >
              ›
            </button>
          </div>

          {/* 캡션 */}
          {post?.caption && (
            <div className="mt-4 space-y-2">
              <p className="text-white text-xs leading-relaxed">
                <span className="font-semibold mr-1.5">pyeonzipshop</span>
                {post.caption}
              </p>
              {post.hashtags && post.hashtags.length > 0 && (
                <p className="text-blue-400 text-xs leading-relaxed">
                  {post.hashtags.map(t => `#${t}`).join(' ')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 썸네일 스트립 */}
        <div className="w-full max-w-sm mt-8">
          <p className="text-zinc-600 text-xs mb-3">전체 슬라이드</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentIndex(i)}
                className={`shrink-0 w-14 aspect-square rounded overflow-hidden border transition-colors ${
                  i === currentIndex ? 'border-white' : 'border-zinc-800 opacity-60 hover:opacity-100'
                }`}
              >
                {s.image_url ? (
                  <img src={s.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-mono">
                    {i + 1}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FontSizeInput ────────────────────────────────────────────────────────────

function FontSizeInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [raw, setRaw] = useState(String(value))

  useEffect(() => { setRaw(String(value)) }, [value])

  const commit = (s: string) => {
    const n = parseInt(s, 10)
    if (!isNaN(n) && n >= 6 && n <= 120) onChange(n)
    else setRaw(String(value))
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className="text-zinc-500 text-xs">크기</span>
      <button
        onClick={() => onChange(Math.max(6, value - 1))}
        className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700
          text-zinc-400 rounded text-xs transition-colors"
      >−</button>
      <input
        type="text"
        value={raw}
        onChange={e => setRaw(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(raw) }}
        className="w-10 bg-zinc-800 text-white text-xs text-center rounded px-1 py-1
          border border-zinc-700 focus:border-zinc-400 outline-none font-mono transition-colors"
      />
      <span className="text-zinc-600 text-xs">px</span>
      <button
        onClick={() => onChange(Math.min(120, value + 1))}
        className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700
          text-zinc-400 rounded text-xs transition-colors"
      >+</button>
    </div>
  )
}

// ─── ColorInput ───────────────────────────────────────────────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [raw, setRaw] = useState(value.replace(/^#/, ''))
  const [invalid, setInvalid] = useState(false)

  // 외부에서 값이 바뀌면 동기화
  useEffect(() => { setRaw(value.replace(/^#/, '')) }, [value])

  const commit = (input: string) => {
    const parsed = parseHex(input)
    if (parsed) {
      setInvalid(false)
      onChange(parsed)
      setRaw(parsed.replace(/^#/, ''))
    } else {
      setInvalid(input.trim() !== '')
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-zinc-500 text-xs">{label}</span>
      {/* 색상 프리뷰 스왓치 */}
      <div
        className="w-4 h-4 rounded-sm border border-zinc-600 shrink-0"
        style={{ backgroundColor: parseHex(raw) ?? 'transparent' }}
      />
      <span className="text-zinc-600 text-xs">#</span>
      <input
        type="text"
        value={raw}
        maxLength={6}
        placeholder="ffffff"
        onChange={e => {
          const v = e.target.value.replace(/[^0-9a-fA-F]/g, '')
          setRaw(v)
          if (v.length === 3 || v.length === 6) commit(v)
          else if (v.length === 0) { setInvalid(false); onChange('') }
        }}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(raw) }}
        className={`w-20 bg-zinc-800 text-xs text-white rounded px-2 py-1 outline-none font-mono
          border ${invalid ? 'border-red-500' : 'border-zinc-700'} focus:border-zinc-400 transition-colors`}
      />
    </div>
  )
}
