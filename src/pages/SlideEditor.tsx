import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateCaption, recommendImage } from '../lib/claude'
import type { Slide, BrandResearch } from '../types'
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
  const [tempSaving, setTempSaving] = useState(false)
  const [tempSaved, setTempSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // 리서치 결과 모달
  const [researchData, setResearchData] = useState<BrandResearch | null>(null)
  const [showResearchModal, setShowResearchModal] = useState(false)

  // 드래그 앤 드롭 순서 변경
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // 이미지 추천 (슬라이드 ID별 저장)
  const [imageRecs, setImageRecs] = useState<Record<string, string>>({})
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)

  // 캡션 & 해시태그
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [generatingCaption, setGeneratingCaption] = useState(false)
  const [captionError, setCaptionError] = useState<string | null>(null)

  // 로고
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // 슬라이드 + 캡션 + 로고 불러오기
  useEffect(() => {
    if (!postId) { setLoading(false); return }

    Promise.all([
      supabase.from('slides').select('*').eq('post_id', postId).order('slide_number'),
      supabase.from('posts').select('caption, hashtags, logo_url, brand_id').eq('id', postId).single(),
    ]).then(async ([slidesRes, postRes]) => {
      if (slidesRes.data) setSlides(slidesRes.data as Slide[])
      if (postRes.data) {
        setCaption(postRes.data.caption ?? '')
        setHashtags(postRes.data.hashtags ?? [])
        setLogoUrl(postRes.data.logo_url ?? null)

        if (postRes.data.brand_id) {
          const { data: brandData } = await supabase
            .from('brands')
            .select('research_data')
            .eq('id', postRes.data.brand_id)
            .single()
          if (brandData?.research_data) {
            setResearchData(brandData.research_data as unknown as BrandResearch)
          }
        }
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

  // 슬라이드 + 캡션 공통 저장 헬퍼
  const saveData = useCallback(async (opts: { setStatus: boolean }) => {
    if (!postId || slides.length === 0) return null

    const updates = slides.map(({ id, slide_number, title, text_content, image_url, image_prompt, text_layout }) => ({
      id, slide_number, title, text_content, image_url, image_prompt, text_layout,
      updated_at: new Date().toISOString(),
    }))

    const { error: slidesErr } = await supabase.from('slides').upsert(updates)
    if (slidesErr) return slidesErr.message

    const postUpdate = opts.setStatus
      ? { status: 'ready' as const, caption: caption || null, hashtags: hashtags.length ? hashtags : null, logo_url: logoUrl }
      : { caption: caption || null, hashtags: hashtags.length ? hashtags : null, logo_url: logoUrl }

    const { error: postErr } = await supabase.from('posts').update(postUpdate).eq('id', postId)
    if (postErr) return postErr.message

    return null
  }, [slides, postId, caption, hashtags, logoUrl])

  // 임시저장 (대시보드 이동 없음, status 유지)
  const handleTempSave = useCallback(async () => {
    setTempSaving(true)
    setSaveError(null)
    const err = await saveData({ setStatus: false })
    setTempSaving(false)
    if (err) { setSaveError(`저장 실패: ${err}`); return }
    setIsDirty(false)
    setTempSaved(true)
    setTimeout(() => setTempSaved(false), 2000)
  }, [saveData])

  // 최종 저장 (status → ready, 대시보드 이동)
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    const err = await saveData({ setStatus: true })
    setSaving(false)
    if (err) { setSaveError(`저장 실패: ${err}`); return }
    setIsDirty(false)
    setSaveSuccess(true)
    setTimeout(() => navigate('/dashboard'), 1000)
  }, [saveData, navigate])

  // 로고 업로드
  const handleLogoUpload = useCallback(async (file: File) => {
    if (!postId) return
    if (!file.type.startsWith('image/')) { setLogoError('이미지 파일만 업로드 가능합니다.'); return }
    setLogoUploading(true)
    setLogoError(null)
    const path = `logos/${postId}`
    const { error: upErr } = await supabase.storage
      .from('slide-images')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setLogoError(`업로드 실패: ${upErr.message}`); setLogoUploading(false); return }
    const { data } = supabase.storage.from('slide-images').getPublicUrl(path)
    setLogoUrl(`${data.publicUrl}?t=${Date.now()}`)
    setIsDirty(true)
    setLogoUploading(false)
  }, [postId])

  // 빈 슬라이드 추가
  const handleAddSlide = useCallback(async () => {
    if (!postId) return
    const newSlideNumber = slides.length + 1
    const { data, error } = await supabase
      .from('slides')
      .insert({
        post_id: postId,
        slide_number: newSlideNumber,
        title: null,
        text_content: null,
        image_url: null,
        image_prompt: null,
        text_layout: null,
      })
      .select()
      .single()
    if (error || !data) return
    setSlides(prev => [...prev, data as Slide])
    setSelectedIndex(newSlideNumber - 1)
    setIsDirty(true)
  }, [postId, slides.length])

  // 드래그 재정렬
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const reordered = [...slides]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    const renumbered = reordered.map((s, i) => ({ ...s, slide_number: i + 1 }))
    setSlides(renumbered)
    setSelectedIndex(dropIndex)
    setDragIndex(null)
    setDragOverIndex(null)
    setIsDirty(true)
  }, [dragIndex, slides])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

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
          <span className="hidden sm:inline text-zinc-700 text-sm">|</span>
          <span className="hidden sm:inline text-white text-sm font-medium">슬라이드 에디터</span>
          {isDirty && <span className="text-zinc-600 text-xs">· 저장 안 됨</span>}
        </div>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-red-400 text-xs">{saveError}</span>}
          {saveSuccess && <span className="text-green-400 text-xs">저장됐습니다</span>}
          {tempSaved && <span className="text-green-400 text-xs">임시저장 완료</span>}
          {researchData && (
            <button
              onClick={() => setShowResearchModal(true)}
              disabled={saving || tempSaving}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              리서치 결과
            </button>
          )}
          <button
            onClick={() => navigate(`/preview?postId=${postId}`)}
            disabled={saving || tempSaving}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            미리보기
          </button>
          <button
            onClick={handleTempSave}
            disabled={saving || tempSaving}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {tempSaving ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || tempSaving}
            className="px-4 py-1.5 bg-white text-zinc-950 text-sm font-medium rounded-md
              hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      {/* 모바일 전용: 가로 슬라이드 스트립 */}
      <div className="md:hidden flex gap-2 overflow-x-auto shrink-0 px-3 py-2 border-b border-zinc-800">
        {slides.map((slide, i) => (
          <div key={slide.id} className="shrink-0 w-28">
            <SlideCard
              slide={slide}
              isSelected={i === selectedIndex}
              onClick={() => setSelectedIndex(i)}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              isDragOver={dragOverIndex === i && dragIndex !== i}
            />
          </div>
        ))}
        <div className="shrink-0 w-28">
          <button
            onClick={handleAddSlide}
            onDragEnd={handleDragEnd}
            className="w-full aspect-square rounded-lg border-2 border-dashed border-zinc-700
              hover:border-zinc-500 flex items-center justify-center text-zinc-600
              hover:text-zinc-400 transition-colors text-2xl"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 데스크톱 전용: 좌측 썸네일 사이드바 */}
        <aside
          className="hidden md:block w-52 border-r border-zinc-800 overflow-y-auto shrink-0 p-3 space-y-2"
          onDragEnd={handleDragEnd}
        >
          {slides.map((slide, i) => (
            <SlideCard
              key={slide.id}
              slide={slide}
              isSelected={i === selectedIndex}
              onClick={() => setSelectedIndex(i)}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              isDragOver={dragOverIndex === i && dragIndex !== i}
            />
          ))}
          <button
            onClick={handleAddSlide}
            className="w-full aspect-square rounded-lg border-2 border-dashed border-zinc-700
              hover:border-zinc-500 flex items-center justify-center text-zinc-600
              hover:text-zinc-400 transition-colors text-2xl"
          >
            +
          </button>
        </aside>

        {/* 편집 패널 */}
        {selectedSlide && (
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
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
                  rows={18}
                  className="w-full bg-zinc-900 text-white text-sm leading-relaxed
                    rounded-lg p-4 outline-none border border-zinc-800
                    focus:border-zinc-600 placeholder:text-zinc-700
                    resize-none transition-colors"
                />
              </div>

              {/* 계정 로고 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-500 text-xs">
                    계정 로고
                    <span className="ml-1.5 text-zinc-700">모든 슬라이드에 공통 적용</span>
                  </label>
                  {logoUrl && (
                    <button
                      onClick={() => { setLogoUrl(null); setIsDirty(true) }}
                      className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div
                  onClick={() => logoInputRef.current?.click()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleLogoUpload(f) }}
                  onDragOver={e => e.preventDefault()}
                  className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-600
                    rounded-lg cursor-pointer transition-colors"
                >
                  {logoUrl ? (
                    <>
                      <img src={logoUrl} alt="로고" className="h-10 w-auto object-contain rounded" />
                      <span className="text-zinc-500 text-xs">클릭 또는 드래그로 교체</span>
                    </>
                  ) : (
                    <span className="text-zinc-600 text-xs">
                      {logoUploading ? '업로드 중...' : '클릭 또는 드래그앤드롭으로 로고 업로드'}
                    </span>
                  )}
                </div>
                {logoError && <p className="text-red-400 text-xs">{logoError}</p>}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f) }}
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

      {/* 리서치 결과 모달 */}
      {showResearchModal && researchData && (
        <ResearchModal research={researchData} onClose={() => setShowResearchModal(false)} />
      )}
    </div>
  )
}

// ─── ResearchModal ────────────────────────────────────────────────────────────

function ResearchModal({ research, onClose }: { research: BrandResearch; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-white text-sm font-semibold">리서치 결과 — {research.brandName}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 모달 본문 */}
        <div className="overflow-y-auto p-5 space-y-4">
          <ResearchRow label="창립" value={research.founded} />
          <ResearchRow label="창립자" value={research.founder} />
          <ResearchRow label="브랜드 철학" value={research.philosophy} />
          <ResearchRow label="시그니처 디테일" value={research.signatureDetails} />
          <ResearchRow label="파고들기 포인트" value={research.diggingPoint} />
          <ResearchRow label="무드 & 분위기" value={research.moodDescription} />
          {research.keywords && research.keywords.length > 0 && (
            <div className="space-y-1">
              <p className="text-zinc-500 text-xs">키워드</p>
              <div className="flex flex-wrap gap-1.5">
                {research.keywords.map((kw, i) => (
                  <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ResearchRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="space-y-1">
      <p className="text-zinc-500 text-xs">{label}</p>
      <p className="text-zinc-200 text-sm leading-relaxed">{value}</p>
    </div>
  )
}
