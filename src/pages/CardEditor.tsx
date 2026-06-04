import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { defaultLayout, renderSlideToBlob } from '../lib/canvas'
import type { Slide, TextLayout } from '../types'

type PostMeta = {
  caption: string | null
  hashtags: string[] | null
  brands: { brand_name: string } | null
  logo_url: string | null
}

export default function CardEditor() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const postId = searchParams.get('postId')

  const [slides, setSlides] = useState<Slide[]>([])
  const [post, setPost] = useState<PostMeta | null>(null)
  const [layouts, setLayouts] = useState<Record<string, TextLayout>>({})
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!postId) { setLoading(false); return }
    Promise.all([
      supabase.from('slides').select('*').eq('post_id', postId).order('slide_number'),
      supabase.from('posts').select('caption, hashtags, logo_url, brands(brand_name)').eq('id', postId).single(),
    ]).then(([slidesRes, postRes]) => {
      if (slidesRes.data) {
        const data = slidesRes.data as Slide[]
        setSlides(data)
        const init: Record<string, TextLayout> = {}
        for (const s of data) init[s.id] = s.text_layout ?? defaultLayout(!!s.image_url)
        setLayouts(init)
      }
      if (postRes.data) setPost(postRes.data as unknown as PostMeta)
      setLoading(false)
    })
  }, [postId])

  const handleUpdateCard = useCallback(async (
    slideId: string,
    slideUpdates: { title?: string | null; text_content?: string | null; image_url?: string | null },
    newLayout: TextLayout,
  ) => {
    await supabase.from('slides').update({
      ...slideUpdates,
      text_layout: newLayout,
      updated_at: new Date().toISOString(),
    }).eq('id', slideId)
    setSlides(prev => prev.map(s => s.id === slideId ? { ...s, ...slideUpdates } : s))
    setLayouts(prev => ({ ...prev, [slideId]: newLayout }))
  }, [])

  const handleDownloadZip = useCallback(async () => {
    if (!slides.length) return
    setDownloading(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      for (const [i, slide] of slides.entries()) {
        const rawLayout = layouts[slide.id] ?? defaultLayout(!!slide.image_url)
        const layout = post?.logo_url && !rawLayout.logoPos
          ? { ...rawLayout, logoPos: defaultLayout(!!slide.image_url).logoPos }
          : rawLayout
        const blob = await renderSlideToBlob(slide, layout, post?.logo_url ?? null)
        zip.file(`slide_${String(i + 1).padStart(2, '0')}.jpg`, blob)
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${post?.brands?.brand_name || 'slides'}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }, [slides, layouts, post])

  if (!postId) {
    return <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">URL에 postId가 필요합니다.</div>
  }
  if (loading) {
    return <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">불러오는 중...</div>
  }
  if (slides.length === 0) {
    return <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">슬라이드가 없습니다.</div>
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
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
          <span className="text-white text-sm font-medium">카드 편집</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/preview?postId=${postId}`)}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
          >
            미리보기
          </button>
          <button
            onClick={handleDownloadZip}
            disabled={downloading}
            className="px-4 py-1.5 bg-white text-zinc-950 text-sm font-medium rounded-md
              hover:bg-zinc-200 disabled:opacity-40 transition-colors"
          >
            {downloading ? '생성 중...' : '↓ 전체 ZIP 다운로드'}
          </button>
        </div>
      </header>

      {/* 안내 */}
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
        <p className="text-zinc-400 text-xs">카드 미리보기 (실제 PNG) — 옆으로 스크롤</p>
        <p className="text-zinc-600 text-xs mt-0.5">
          사진은 각 카드의 <span className="text-zinc-500">이미지 변경</span>으로 직접 넣어주세요. 변경 후 반드시 <span className="text-zinc-500">적용</span>을 눌러 저장하세요.
        </p>
      </div>

      {/* 카드 리스트 */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-5 p-6 min-w-max items-start">
          {slides.map((slide, i) => (
            <CardColumn
              key={slide.id}
              slide={slide}
              layout={layouts[slide.id] ?? defaultLayout(!!slide.image_url)}
              logoUrl={post?.logo_url ?? null}
              index={i}
              onUpdate={handleUpdateCard}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── CardColumn ───────────────────────────────────────────────────────────────

function CardColumn({
  slide,
  layout,
  logoUrl,
  index,
  onUpdate,
}: {
  slide: Slide
  layout: TextLayout
  logoUrl: string | null
  index: number
  onUpdate: (
    id: string,
    updates: { title?: string | null; text_content?: string | null; image_url?: string | null },
    layout: TextLayout,
  ) => Promise<void>
}) {
  const [localSlide, setLocalSlide] = useState(() => slide)
  const [localLayout, setLocalLayout] = useState(() => layout)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const label = index === 0 ? 'HOOK' : `BODY ${index}`

  const handleApply = async () => {
    setSaving(true)
    try {
      await onUpdate(
        slide.id,
        { title: localSlide.title, text_content: localSlide.text_content },
        localLayout,
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    const path = `slides/${slide.id}`
    const { error } = await supabase.storage
      .from('slide-images')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setUploading(false); return }
    const { data } = supabase.storage.from('slide-images').getPublicUrl(path)
    const newUrl = `${data.publicUrl}?t=${Date.now()}`
    setLocalSlide(prev => ({ ...prev, image_url: newUrl }))
    await onUpdate(slide.id, { image_url: newUrl }, localLayout)
    setUploading(false)
  }, [slide.id, localLayout, onUpdate])

  const imagePosition = localLayout.imagePosition ?? 'center'
  const objPosClass = imagePosition === 'left' ? 'object-left' : imagePosition === 'right' ? 'object-right' : 'object-center'

  return (
    <div className="shrink-0 w-72 flex flex-col gap-3">
      {/* 라벨 */}
      <p className="text-zinc-600 text-xs font-mono tracking-widest">{label}</p>

      {/* 카드 미리보기 */}
      <div className="relative w-full aspect-square bg-zinc-900 rounded-lg overflow-hidden select-none">
        {localSlide.image_url ? (
          <img
            src={localSlide.image_url}
            alt=""
            className={`w-full h-full object-cover ${objPosClass}`}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-zinc-900 to-zinc-950" />
        )}
        {localSlide.image_url && (localSlide.title || localSlide.text_content) && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        )}
        {localSlide.title && (
          <div
            className="absolute font-semibold leading-snug drop-shadow select-none"
            style={{
              left: `${localLayout.title?.x ?? 5}%`,
              top: `${localLayout.title?.y ?? 72}%`,
              maxWidth: '90%',
              color: localLayout.titleColor || '#ffffff',
              fontSize: `${(localLayout.titleSize ?? 14) * 0.75}px`,
            }}
          >
            {localSlide.title}
          </div>
        )}
        {localSlide.text_content && (
          <div
            className="absolute leading-relaxed drop-shadow whitespace-pre-wrap select-none"
            style={{
              left: `${localLayout.body?.x ?? 5}%`,
              top: `${localLayout.body?.y ?? 82}%`,
              maxWidth: '90%',
              color: localLayout.bodyColor || '#ffffff',
              fontSize: `${(localLayout.bodySize ?? 11) * 0.75}px`,
            }}
          >
            {localSlide.text_content}
          </div>
        )}
        {logoUrl && localLayout.logoPos && (
          <img
            src={logoUrl}
            alt="logo"
            className="absolute object-contain"
            style={{
              left: `${localLayout.logoPos.x}%`,
              top: `${localLayout.logoPos.y}%`,
              width: `${localLayout.logoPos.size}%`,
            }}
          />
        )}
      </div>

      {/* 이미지 위치 */}
      {localSlide.image_url && (
        <div className="flex items-center gap-1 bg-zinc-900 rounded-md p-1">
          {(['left', 'center', 'right'] as const).map(pos => (
            <button
              key={pos}
              onClick={() => setLocalLayout(prev => ({ ...prev, imagePosition: pos }))}
              className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                imagePosition === pos
                  ? 'bg-white text-zinc-900 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {pos === 'left' ? '◄' : pos === 'right' ? '►' : '중앙'}
            </button>
          ))}
        </div>
      )}

      {/* 이미지 변경 */}
      <button
        onClick={() => imageInputRef.current?.click()}
        disabled={uploading}
        className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm
          rounded-md transition-colors disabled:opacity-40"
      >
        {uploading ? '업로드 중...' : localSlide.image_url ? '이미지 다시 변경' : '이미지 변경'}
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }}
      />

      {/* 텍스트 편집 */}
      <div className="bg-zinc-900 rounded-lg p-3 space-y-4">
        {/* 제목 */}
        <div className="space-y-2">
          <label className="text-zinc-500 text-xs block">제목 수정</label>
          <textarea
            value={localSlide.title ?? ''}
            onChange={e => setLocalSlide(prev => ({ ...prev, title: e.target.value || null }))}
            rows={2}
            className="w-full bg-zinc-800 text-white text-xs rounded-md p-2 outline-none
              border border-zinc-700 focus:border-zinc-500 resize-none placeholder:text-zinc-600
              transition-colors"
            placeholder="제목 없음"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <ColorPicker
              label="글자색"
              value={localLayout.titleColor || '#ffffff'}
              onChange={v => setLocalLayout(prev => ({ ...prev, titleColor: v }))}
            />
            <SizeStepper
              value={localLayout.titleSize ?? 14}
              onChange={v => setLocalLayout(prev => ({ ...prev, titleSize: v }))}
            />
          </div>
        </div>

        <div className="border-t border-zinc-800" />

        {/* 본문 */}
        <div className="space-y-2">
          <label className="text-zinc-500 text-xs block">본문 수정</label>
          <textarea
            value={localSlide.text_content ?? ''}
            onChange={e => setLocalSlide(prev => ({ ...prev, text_content: e.target.value || null }))}
            rows={5}
            className="w-full bg-zinc-800 text-white text-xs rounded-md p-2 outline-none
              border border-zinc-700 focus:border-zinc-500 resize-none placeholder:text-zinc-600
              transition-colors"
            placeholder="본문 없음"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <ColorPicker
              label="글자색"
              value={localLayout.bodyColor || '#ffffff'}
              onChange={v => setLocalLayout(prev => ({ ...prev, bodyColor: v }))}
            />
            <SizeStepper
              value={localLayout.bodySize ?? 11}
              onChange={v => setLocalLayout(prev => ({ ...prev, bodySize: v }))}
            />
          </div>
        </div>
      </div>

      {/* 적용 버튼 */}
      <button
        onClick={handleApply}
        disabled={saving}
        className={`w-full py-2.5 text-sm font-medium rounded-md transition-colors disabled:opacity-40 ${
          saved
            ? 'bg-green-700 text-white'
            : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
        }`}
      >
        {saved ? '적용됨 ✓' : saving ? '저장 중...' : index === 0 ? '제목·색·크기 적용' : '본문·라벨 적용'}
      </button>
    </div>
  )
}

// ─── ColorPicker ──────────────────────────────────────────────────────────────

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-600 text-xs">{label}</span>
      <label className="relative cursor-pointer">
        <div
          className="w-6 h-6 rounded border border-zinc-600 shadow-inner"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </label>
    </div>
  )
}

// ─── SizeStepper ─────────────────────────────────────────────────────────────

function SizeStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-zinc-600 text-xs">크기</span>
      <button
        onClick={() => onChange(Math.max(6, value - 1))}
        className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700
          text-zinc-400 rounded text-xs transition-colors"
      >−</button>
      <span className="text-zinc-300 text-xs w-7 text-center font-mono">{value}</span>
      <button
        onClick={() => onChange(Math.min(120, value + 1))}
        className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700
          text-zinc-400 rounded text-xs transition-colors"
      >+</button>
    </div>
  )
}
