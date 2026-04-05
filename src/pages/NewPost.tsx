import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGeminiResearch } from '../lib/gemini'
import { generateSlides } from '../lib/claude'
import type { BrandResearch } from '../types'

type Step = 1 | 2 | 3 | 4

const STEP_LABELS = ['브랜드 입력', '리서치', '슬라이드 생성', '완료']

export default function NewPost() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftPostId = searchParams.get('postId')

  const [step, setStep] = useState<Step>(1)
  const [brandName, setBrandName] = useState('')
  const [brandUrl, setBrandUrl] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)

  // 편집 중인 기존 draft의 DB ID
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(!!draftPostId)
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const {
    data: research,
    loading: researchLoading,
    error: researchError,
    research: runResearch,
    reset: resetResearch,
  } = useGeminiResearch()

  const [editedResearch, setEditedResearch] = useState<BrandResearch | null>(null)

  useEffect(() => {
    if (research) setEditedResearch(research)
  }, [research])

  const handleEditResearch = useCallback((field: keyof BrandResearch, value: string | string[]) => {
    setEditedResearch(prev => prev ? { ...prev, [field]: value } : prev)
  }, [])

  // 기존 draft 로드
  useEffect(() => {
    if (!draftPostId) return

    async function loadDraft() {
      try {
        // post 조회
        const { data: postData, error: postErr } = await supabase
          .from('posts')
          .select('id, brand_id')
          .eq('id', draftPostId)
          .single()

        if (postErr || !postData) { navigate('/dashboard'); return }

        // 슬라이드가 이미 있으면 에디터로 바로 이동
        const { count } = await supabase
          .from('slides')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', draftPostId)

        if (count && count > 0) {
          navigate(`/slide-editor?postId=${draftPostId}`, { replace: true })
          return
        }

        // brand 조회
        if (postData.brand_id) {
          const { data: brandData } = await supabase
            .from('brands')
            .select('id, brand_name, research_data')
            .eq('id', postData.brand_id)
            .single()

          if (brandData) {
            setEditingBrandId(brandData.id)
            setBrandName(brandData.brand_name ?? '')
            if (brandData.research_data) {
              setEditedResearch(brandData.research_data as unknown as BrandResearch)
              setStep(2)
            }
          }
        }

        setEditingPostId(postData.id)
      } finally {
        setDraftLoading(false)
      }
    }

    loadDraft()
  }, [draftPostId, navigate])

  const isLoading = researchLoading || generating || saving

  // 이탈 방지
  useEffect(() => {
    if (!isLoading) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isLoading])

  // Step 1 → Step 2: 브랜드명 제출 + 리서치 자동 시작
  const handleBrandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = brandName.trim()
    if (!name) return
    setStep(2)
    runResearch(name, brandUrl.trim() || undefined)
  }

  // Step 2 → Step 3
  const handleConfirmResearch = () => { setStep(3) }

  // 임시저장
  const handleDraftSave = useCallback(async () => {
    const name = brandName.trim()
    if (!name) return
    setDraftSaving(true)
    setDraftError(null)
    try {
      if (editingPostId && editingBrandId) {
        const { error } = await supabase
          .from('brands')
          .update({
            brand_name: name,
            research_data: editedResearch as unknown as Record<string, unknown> | null,
          })
          .eq('id', editingBrandId)
        if (error) throw new Error(error.message)
      } else {
        const { data: brandData, error: brandErr } = await supabase
          .from('brands')
          .insert({
            brand_name: name,
            research_data: editedResearch as unknown as Record<string, unknown> | null,
          })
          .select('id')
          .single()
        if (brandErr) throw new Error(brandErr.message)

        const { error: postErr } = await supabase
          .from('posts')
          .insert({ brand_id: brandData.id, status: 'draft' })
        if (postErr) throw new Error(postErr.message)
      }
      navigate('/dashboard')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : '임시저장 실패')
    } finally {
      setDraftSaving(false)
    }
  }, [brandName, editedResearch, editingPostId, editingBrandId, navigate])

  // Step 3 → Step 4: 슬라이드 생성 + 저장
  const handleGenerateSlides = useCallback(async () => {
    if (!editedResearch) return
    const research = editedResearch
    setTaskError(null)
    setGenerating(true)

    let slides
    try {
      slides = await generateSlides(research)
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : '슬라이드 생성 중 오류가 발생했습니다.')
      setGenerating(false)
      return
    }

    setGenerating(false)
    setSaving(true)
    setStep(4)

    const slideRows = (postId: string) =>
      slides.map((s) => ({
        post_id: postId,
        slide_number: s.slide_number,
        title: s.title,
        text_content: s.text_content,
        image_url: null,
        image_prompt: s.image_prompt,
      }))

    try {
      if (editingPostId && editingBrandId) {
        // 기존 draft 업데이트
        const { error: brandErr } = await supabase
          .from('brands')
          .update({ research_data: research as unknown as Record<string, unknown> })
          .eq('id', editingBrandId)
        if (brandErr) throw new Error(`브랜드 업데이트 실패: ${brandErr.message}`)

        await supabase.from('slides').delete().eq('post_id', editingPostId)

        const { error: slidesErr } = await supabase.from('slides').insert(slideRows(editingPostId))
        if (slidesErr) throw new Error(`슬라이드 저장 실패: ${slidesErr.message}`)

        navigate(`/slide-editor?postId=${editingPostId}`)
      } else {
        // 신규 생성
        const { data: brandData, error: brandErr } = await supabase
          .from('brands')
          .insert({
            brand_name: research.brandName,
            research_data: research as unknown as Record<string, unknown>,
          })
          .select('id')
          .single()
        if (brandErr) throw new Error(`브랜드 저장 실패: ${brandErr.message}`)

        const { data: postData, error: postErr } = await supabase
          .from('posts')
          .insert({ brand_id: brandData.id, status: 'draft' })
          .select('id')
          .single()
        if (postErr) throw new Error(`포스트 저장 실패: ${postErr.message}`)

        const { error: slidesErr } = await supabase.from('slides').insert(slideRows(postData.id))
        if (slidesErr) throw new Error(`슬라이드 저장 실패: ${slidesErr.message}`)

        navigate(`/slide-editor?postId=${postData.id}`)
      }
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
      setSaving(false)
      setStep(3)
    }
  }, [editedResearch, editingPostId, editingBrandId, navigate])

  const handleRetryResearch = () => {
    resetResearch()
    setEditedResearch(null)
    setStep(2)
    runResearch(brandName.trim(), brandUrl.trim() || undefined)
  }

  const isEditing = !!(editingPostId && editingBrandId)

  if (draftLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-zinc-800 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          disabled={isLoading}
          className="text-zinc-500 hover:text-white text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← 대시보드
        </button>
        <span className="text-zinc-700 text-sm">|</span>
        <span className="text-white text-sm font-medium">
          {isEditing ? '포스트 수정' : '새 포스트 만들기'}
        </span>
      </header>

      <div className="flex-1 flex flex-col items-center px-6 py-12">
        {/* Step Indicator */}
        <div className="flex items-center gap-0 mb-12 w-full max-w-lg">
          {STEP_LABELS.map((label, i) => {
            const num = (i + 1) as Step
            const isActive = step === num
            const isDone = step > num
            return (
              <div key={num} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      isDone
                        ? 'bg-white text-zinc-950'
                        : isActive
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {isDone ? '✓' : num}
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap transition-colors ${
                      isActive ? 'text-white' : 'text-zinc-600'
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 mb-5 transition-colors ${
                      step > num ? 'bg-white' : 'bg-zinc-800'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Step Content */}
        <div className="w-full max-w-lg">
          {step === 1 && (
            <StepBrandInput
              brandName={brandName}
              brandUrl={brandUrl}
              onChangeName={setBrandName}
              onChangeUrl={setBrandUrl}
              onSubmit={handleBrandSubmit}
              onDraftSave={handleDraftSave}
              draftSaving={draftSaving}
              draftError={draftError}
            />
          )}

          {step === 2 && (
            <StepResearch
              brandName={brandName}
              research={editedResearch}
              loading={researchLoading}
              error={researchError}
              onRetry={handleRetryResearch}
              onNext={handleConfirmResearch}
              onEdit={handleEditResearch}
              onDraftSave={handleDraftSave}
              draftSaving={draftSaving}
              draftError={draftError}
            />
          )}

          {step === 3 && editedResearch && (
            <StepConfirm
              research={editedResearch}
              generating={generating}
              error={taskError}
              onGenerate={handleGenerateSlides}
            />
          )}

          {step === 4 && (
            <StepSaving saving={saving} error={taskError} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 1: 브랜드 입력 ──────────────────────────────────────────────────────

function StepBrandInput({
  brandName,
  brandUrl,
  onChangeName,
  onChangeUrl,
  onSubmit,
  onDraftSave,
  draftSaving,
  draftError,
}: {
  brandName: string
  brandUrl: string
  onChangeName: (v: string) => void
  onChangeUrl: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  onDraftSave: () => void
  draftSaving: boolean
  draftError: string | null
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">어떤 브랜드를 소개할까요?</h2>
        <p className="text-zinc-500 text-sm">브랜드명과 공식 홈페이지를 입력하면 더 정확하게 리서치합니다.</p>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-zinc-500 text-xs">브랜드명 *</label>
          <input
            type="text"
            value={brandName}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="예: Maison Margiela"
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3
              text-white placeholder:text-zinc-600 text-sm outline-none
              focus:border-zinc-500 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-zinc-500 text-xs">공식 홈페이지 <span className="text-zinc-700">(선택)</span></label>
          <input
            type="url"
            value={brandUrl}
            onChange={(e) => onChangeUrl(e.target.value)}
            placeholder="예: https://www.maisonmargiela.com"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3
              text-white placeholder:text-zinc-600 text-sm outline-none
              focus:border-zinc-500 transition-colors"
          />
        </div>
      </div>
      {draftError && <p className="text-red-400 text-xs">{draftError}</p>}
      <div className="space-y-2 pt-2">
        <button
          type="submit"
          disabled={!brandName.trim() || draftSaving}
          className="w-full py-3 bg-white text-zinc-950 font-medium rounded-lg text-sm
            hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          리서치 시작
        </button>
        <button
          type="button"
          onClick={onDraftSave}
          disabled={!brandName.trim() || draftSaving}
          className="w-full py-2.5 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800
            text-zinc-400 rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {draftSaving ? '저장 중...' : '임시저장'}
        </button>
      </div>
    </form>
  )
}

// ─── Step 2: 리서치 로딩 / 결과 ──────────────────────────────────────────────

function StepResearch({
  brandName,
  research,
  loading,
  error,
  onRetry,
  onNext,
  onEdit,
  onDraftSave,
  draftSaving,
  draftError,
}: {
  brandName: string
  research: BrandResearch | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onNext: () => void
  onEdit: (field: keyof BrandResearch, value: string | string[]) => void
  onDraftSave: () => void
  draftSaving: boolean
  draftError: string | null
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Spinner />
        <p className="text-zinc-400 text-sm">
          <span className="font-medium text-white">{brandName}</span> 리서치 중...
        </p>
        <p className="text-zinc-600 text-xs">Google Search 기반으로 검색 중입니다.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
        <button
          onClick={onRetry}
          className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors"
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (!research) return null

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{research.brandName}</h2>
        <p className="text-zinc-500 text-sm">
          리서치 결과를 확인하고 틀린 내용은 클릭해서 수정하세요.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 text-sm">
        <EditableResearchRow label="설립" value={research.founded} onChange={(v) => onEdit('founded', v)} />
        <EditableResearchRow label="창립자" value={research.founder} onChange={(v) => onEdit('founder', v)} />
        <EditableResearchRow label="브랜드 철학" value={research.philosophy} multiline onChange={(v) => onEdit('philosophy', v)} />
        <EditableKeywordsRow keywords={research.keywords} onChange={(v) => onEdit('keywords', v)} />
        <EditableResearchRow label="시그니처 디테일" value={research.signatureDetails} multiline onChange={(v) => onEdit('signatureDetails', v)} />
        <EditableResearchRow label="디깅 포인트" value={research.diggingPoint} multiline onChange={(v) => onEdit('diggingPoint', v)} />
        <EditableResearchRow label="무드" value={research.moodDescription} multiline onChange={(v) => onEdit('moodDescription', v)} />
      </div>

      {draftError && <p className="text-red-400 text-xs">{draftError}</p>}

      <div className="space-y-2">
        <div className="flex gap-3">
          <button
            onClick={onRetry}
            disabled={draftSaving}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-30"
          >
            다시 리서치
          </button>
          <button
            onClick={onDraftSave}
            disabled={draftSaving}
            className="flex-1 py-3 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800
              text-zinc-400 rounded-lg text-sm disabled:opacity-30 transition-colors"
          >
            {draftSaving ? '저장 중...' : '임시저장'}
          </button>
        </div>
        <button
          onClick={onNext}
          disabled={draftSaving}
          className="w-full py-3 bg-white text-zinc-950 font-medium rounded-lg text-sm
            hover:bg-zinc-200 disabled:opacity-30 transition-colors"
        >
          계속하기
        </button>
      </div>
    </div>
  )
}

function EditableResearchRow({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string
  value: string
  multiline?: boolean
  onChange: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const startEdit = () => { setDraft(value); setEditing(true) }
  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onChange(trimmed)
    setEditing(false)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const inputClass =
    'w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-zinc-200 text-sm outline-none focus:border-zinc-400 transition-colors resize-none'

  if (editing) {
    return (
      <div>
        <p className="text-zinc-500 text-xs mb-0.5">{label}</p>
        {multiline ? (
          <textarea
            ref={inputRef as React.Ref<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            className={inputClass}
            rows={3}
          />
        ) : (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            className={inputClass}
          />
        )}
      </div>
    )
  }

  return (
    <div className="group cursor-text" onClick={startEdit}>
      <p className="text-zinc-500 text-xs mb-0.5">
        {label}
        <span className="ml-1.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity">편집</span>
      </p>
      <p className="text-zinc-200 leading-relaxed group-hover:text-white transition-colors">{value}</p>
    </div>
  )
}

function EditableKeywordsRow({
  keywords,
  onChange,
}: {
  keywords: string[]
  onChange: (v: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(keywords.join(', '))
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => { setDraft(keywords.join(', ')); setEditing(true) }
  const commit = () => {
    const parsed = draft.split(',').map((k) => k.trim()).filter(Boolean)
    if (parsed.length) onChange(parsed)
    setEditing(false)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <div>
        <p className="text-zinc-500 text-xs mb-1.5">
          키워드 <span className="text-zinc-600">(쉼표로 구분)</span>
        </p>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-zinc-200 text-sm outline-none focus:border-zinc-400 transition-colors"
        />
      </div>
    )
  }

  return (
    <div className="group cursor-text" onClick={startEdit}>
      <p className="text-zinc-500 text-xs mb-1.5">
        키워드
        <span className="ml-1.5 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity">편집</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw, i) => (
          <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-full">{kw}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Step 3: 슬라이드 생성 확인 ───────────────────────────────────────────────

function StepConfirm({
  research,
  generating,
  error,
  onGenerate,
}: {
  research: BrandResearch
  generating: boolean
  error: string | null
  onGenerate: () => void
}) {
  if (generating) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Spinner />
        <p className="text-zinc-400 text-sm">
          <span className="font-medium text-white">{research.brandName}</span> 슬라이드 생성 중...
        </p>
        <p className="text-zinc-600 text-xs">13장 슬라이드를 작성하고 있습니다. 잠시 기다려주세요.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">슬라이드를 생성할까요?</h2>
        <p className="text-zinc-500 text-sm">
          <span className="text-white">{research.brandName}</span> 리서치 기반으로 13장 슬라이드를 자동 생성합니다.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1.5 text-sm">
        <p className="text-zinc-400"><span className="text-zinc-500">브랜드 · </span>{research.brandName}</p>
        <p className="text-zinc-400"><span className="text-zinc-500">슬라이드 · </span>13장</p>
        <p className="text-zinc-400"><span className="text-zinc-500">키워드 · </span>{research.keywords.join(', ')}</p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={onGenerate}
        className="w-full py-3 bg-white text-zinc-950 font-medium rounded-lg text-sm
          hover:bg-zinc-200 transition-colors"
      >
        슬라이드 생성하기
      </button>
    </div>
  )
}

// ─── Step 4: 저장 중 ──────────────────────────────────────────────────────────

function StepSaving({ saving, error }: { saving: boolean; error: string | null }) {
  if (error) {
    return (
      <div className="space-y-4 py-8">
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16">
      {saving && <Spinner />}
      <p className="text-zinc-400 text-sm">데이터 저장 중...</p>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
  )
}
