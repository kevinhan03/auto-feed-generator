import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Slide } from '../types'

type PostMeta = { caption: string | null; hashtags: string[] | null; brands: { brand_name: string } | null }

export default function Preview() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const postId = searchParams.get('postId')

  const [slides, setSlides] = useState<Slide[]>([])
  const [post, setPost] = useState<PostMeta | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!postId) { setLoading(false); return }

    Promise.all([
      supabase.from('slides').select('*').eq('post_id', postId).order('slide_number'),
      supabase.from('posts').select('caption, hashtags, brands(brand_name)').eq('id', postId).single(),
    ]).then(([slidesRes, postRes]) => {
      if (slidesRes.data) setSlides(slidesRes.data as Slide[])
      if (postRes.data) setPost(postRes.data as unknown as PostMeta)
      setLoading(false)
    })
  }, [postId])

  const prev = () => setCurrentIndex(i => Math.max(0, i - 1))
  const next = () => setCurrentIndex(i => Math.min(slides.length - 1, i + 1))

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') prev()
    if (e.key === 'ArrowRight') next()
  }

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
        <button
          onClick={() => navigate(`/slide-editor?postId=${postId}`)}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
        >
          편집하기
        </button>
      </header>

      {/* 본문 */}
      <div className="flex-1 flex flex-col items-center justify-start py-10 px-6 overflow-y-auto">
        {/* 인스타그램 카드 */}
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

          {/* 슬라이드 이미지 영역 (1:1) */}
          <div className="relative w-full aspect-square bg-zinc-900 rounded-sm overflow-hidden select-none">
            {slide.image_url ? (
              <img
                src={slide.image_url}
                alt={slide.title ?? ''}
                className="w-full h-full object-cover"
              />
            ) : (
              /* 이미지 없을 때 텍스트 카드 */
              <div className="w-full h-full flex flex-col justify-end p-6 bg-gradient-to-b from-zinc-900 to-zinc-950">
                {slide.title && (
                  <p className="text-white text-base font-semibold mb-2 leading-snug">{slide.title}</p>
                )}
                {slide.text_content && (
                  <p className="text-zinc-400 text-xs leading-relaxed line-clamp-6">{slide.text_content}</p>
                )}
              </div>
            )}

            {/* 텍스트 오버레이 (이미지 있을 때) */}
            {slide.image_url && (slide.title || slide.text_content) && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-5">
                {slide.title && (
                  <p className="text-white text-sm font-semibold mb-1 leading-snug drop-shadow">{slide.title}</p>
                )}
                {slide.text_content && (
                  <p className="text-zinc-300 text-xs leading-relaxed line-clamp-3 drop-shadow">{slide.text_content}</p>
                )}
              </div>
            )}

            {/* 슬라이드 번호 뱃지 */}
            <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
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

            {/* 도트 인디케이터 */}
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

        {/* 슬라이드 전체 목록 (썸네일 스트립) */}
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
