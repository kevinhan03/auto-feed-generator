import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateCaption, recommendImage } from '../lib/claude'
import type { Slide } from '../types'
import SlideCard from '../components/SlideCard'
import ImageUploader from '../components/ImageUploader'

export default function SlideEditor() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const postId = searchParams.get('postId')

  const [slides, setSlides] = useState<Slide[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // 이미지 추천 (슬라이드 ID별 저장)
  const [imageRecs, setImageRecs] = useState<Record<string, string>>({})
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)

  // 캡션 & 해시태그
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [captionError, setCaptionError] = useState<string | null>(null)

  // 슬라이드 + 캡션 불러오기
  useEffect(() => {
    if (!postId) { setLoading(false); return }

    Promise.all([
      supabase.from('slides').select('*').eq('post_id', postId).order('slide_number'),
      supabase.from('posts').select('caption, hashtags').eq('id', postId).single(),
    ]).then(([slidesRes, postRes]) => {
      if (slidesRes.data) setSlides(slidesRes.data as Slide[])
      if (postRes.data) {
        setCaption(postRes.data.caption ?? '')
        setHashtags(postRes.data.hashtags ?? [])
      }
      setLoading(false)
    })
  }, [postId])

  // selectedIndex 범위 보정
  useEffect(() => {
    if (slides.length > 0 && selectedIndex >= slides.length) {
      setSelectedIndex(slides.length - 1)
    }
  }, [slides.length, selectedIndex])

  // 이탈 방지
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const selectedSlide = slides[Math.min(selectedIndex, slides.length - 1)] ?? null

  const updateField = useCallback(<K extends keyof Slide>(field: K, value: Slide[K]) => {
    setSlides(prev => prev.map((s, i) => i === selectedIndex ? { ...s, [field]: value } : s))
    setIsDirty(true)
  }, [selectedIndex])

  // 저장
  const handleSave = useCallback(async () => {
    if (!postId || slides.length === 0) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const updates = slides.map(({ id, slide_number, title, text_content, image_url, image_prompt }) => ({
      id, slide_number, title, text_content, image_url, image_prompt,
      updated_at: new Date().toISOString(),
    }))

    const { error: slidesErr } = await supabase.from('slides').upsert(updates)
    if (slidesErr) {
      setSaveError(`저장 실패: ${slidesErr.message}`)
      setSaving(false)
      return
    }

    const { error: postErr } = await supabase
      .from('posts')
      .update({ status: 'ready', caption: caption || null, hashtags: hashtags.length ? hashtags : null })
      .eq('id', postId)

    if (postErr) {
      setSaveError(`저장 실패: ${postErr.message}`)
      setSaving(false)
      return
    }

    setIsDirty(false)
    setSaveSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1000)
  }, [slides, postId, caption, hashtags, navigate])

  // 이미지 추천
  const handleRecommendImage = useCallback(async () => {
    if (!selectedSlide) return
    setLoadingRec(true)
    setRecError(null)
    try {
      const result = await recommendImage(selectedSlide)
      setImageRecs(prev => ({ ...prev, [selectedSlide.id]: result }))
    } catch (err) {
      setRecError(err instanceof Error ? err.message : '추천 실패')
    } finally {
      setLoadingRec(false)
    }
  }, [selectedSlide])

  // 캡션 자동 생성
  const handleGenerateCaption = useCallback(async () => {
    if (slides.length === 0) return
    setGeneratingCaption(true)
    setCaptionError(null)
    try {
      const result = await generateCaption(slides)
      setCaption(result.caption)
      setHashtags(result.hashtags)
      setIsDirty(true)
    } catch (err) {
      setCaptionError(err instanceof Error ? err.message : '캡션 생성 실패')
    } finally {
      setGeneratingCaption(false)
    }
  }, [slides])

  // ─── Empty states ──────────────────────────────────────────────────────────

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
        슬라이드 불러오는 중...
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

  // ─── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            disabled={saving}
            className="text-zinc-500 hover:text-white text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← 대시보드
          </button>
          <span className="text-zinc-700 text-sm">|</span>
          <span className="text-white text-sm font-medium">슬라이드 에디터</span>
          {isDirty && <span className="text-zinc-600 text-xs">· 저장 안 됨</span>}
        </div>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-red-400 text-xs">{saveError}</span>}
          {saveSuccess && <span className="text-green-400 text-xs">저장됐습니다</span>}
          <button
            onClick={() => navigate(`/preview?postId=${postId}`)}
            disabled={saving}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            미리보기
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-white text-zinc-950 text-sm font-medium rounded-md
              hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 썸네일 */}
        <aside className="w-52 border-r border-zinc-800 overflow-y-auto shrink-0 p-3 space-y-2">
          {slides.map((slide, i) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              isSelected={i === selectedIndex}
              onClick={() => setSelectedIndex(i)}
            />
          ))}
        </aside>

        {/* 우측: 편집 패널 */}
        {selectedSlide && (
          <main className="flex-1 overflow-y-auto p-8">
            <div className="max-w-xl mx-auto space-y-6">

              {/* 슬라이드 번호 */}
              <p className="text-zinc-600 text-xs font-mono">
                SLIDE {String(selectedSlide.slide_number).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
              </p>

              {/* 제목 */}
              <div className="space-y-1">
                <label className="text-zinc-500 text-xs">제목</label>
                <input
                  type="text"
                  value={selectedSlide.title ?? ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="제목 없음"
                  className="w-full bg-transparent text-white text-lg font-medium
                    border-b border-zinc-700 pb-2 outline-none
                    focus:border-zinc-400 placeholder:text-zinc-700 transition-colors"
                />
              </div>

              {/* 본문 */}
              <div className="space-y-1">
                <label className="text-zinc-500 text-xs">본문</label>
                <textarea
                  value={selectedSlide.text_content ?? ''}
                  onChange={(e) => updateField('text_content', e.target.value)}
                  placeholder="본문을 입력하세요"
                  rows={6}
                  className="w-full bg-zinc-900 text-white text-sm leading-relaxed
                    rounded-lg p-4 outline-none border border-zinc-800
                    focus:border-zinc-600 placeholder:text-zinc-700
                    resize-none transition-colors"
                />
              </div>

              {/* 이미지 프롬프트 */}
              <div className="space-y-1">
                <label className="text-zinc-500 text-xs">
                  이미지 프롬프트
                  <span className="ml-1.5 text-zinc-700">AI 이미지 생성용 영문 설명</span>
                </label>
                <textarea
                  value={selectedSlide.image_prompt ?? ''}
                  onChange={(e) => updateField('image_prompt', e.target.value)}
                  placeholder="A concise English description for AI image generation"
                  rows={3}
                  className="w-full bg-zinc-900 text-zinc-400 text-xs leading-relaxed
                    rounded-lg p-4 outline-none border border-zinc-800
                    focus:border-zinc-600 placeholder:text-zinc-700
                    resize-none transition-colors font-mono"
                />
              </div>

              {/* 이미지 추천 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-500 text-xs">이미지 추천</label>
                  <button
                    onClick={handleRecommendImage}
                    disabled={loadingRec}
                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs
                      rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingRec ? '분석 중...' : '추천받기'}
                  </button>
                </div>

                {recError && (
                  <p className="text-red-400 text-xs">{recError}</p>
                )}

                {selectedSlide && imageRecs[selectedSlide.id] ? (
                  <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-2">
                    <span className="text-zinc-400 text-xs font-medium">아트 디렉터 추천</span>
                    <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {imageRecs[selectedSlide.id]}
                    </p>
                  </div>
                ) : !loadingRec && !recError ? (
                  <p className="text-zinc-700 text-xs">
                    슬라이드 내용을 분석해 어울리는 이미지 방향을 제안합니다.
                  </p>
                ) : null}
              </div>

              {/* 이미지 업로드 */}
              <div className="space-y-1">
                <label className="text-zinc-500 text-xs">이미지</label>
                <ImageUploader
                  slideId={selectedSlide.id}
                  currentImageUrl={selectedSlide.image_url}
                  onUpload={(url) => updateField('image_url', url)}
                />
              </div>

              {/* 구분선 */}
              <div className="border-t border-zinc-800 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-medium">캡션 & 해시태그</p>
                    <p className="text-zinc-600 text-xs mt-0.5">포스트 전체에 적용됩니다</p>
                  </div>
                  <button
                    onClick={handleGenerateCaption}
                    disabled={generatingCaption}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs
                      rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingCaption ? '생성 중...' : '자동 생성'}
                  </button>
                </div>

                {captionError && <p className="text-red-400 text-xs">{captionError}</p>}

                <div className="space-y-1">
                  <label className="text-zinc-500 text-xs">캡션</label>
                  <textarea
                    value={caption}
                    onChange={(e) => { setCaption(e.target.value); setIsDirty(true) }}
                    placeholder="인스타그램 게시물 캡션을 입력하세요"
                    rows={4}
                    className="w-full bg-zinc-900 text-white text-sm leading-relaxed
                      rounded-lg p-4 outline-none border border-zinc-800
                      focus:border-zinc-600 placeholder:text-zinc-700
                      resize-none transition-colors"
                  />
                  <p className="text-zinc-700 text-xs text-right">{caption.length}자</p>
                </div>

                {hashtags.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-zinc-500 text-xs">해시태그 ({hashtags.length}개)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {hashtags.map((tag, i) => (
                        <span key={i} className="bg-zinc-800 text-zinc-400 text-xs px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </main>
        )}
      </div>
    </div>
  )
}
