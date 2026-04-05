import type { Slide } from '../types'

interface SlideCardProps {
  slide: Slide
  isSelected: boolean
  onClick: () => void
}

export default function SlideCard({ slide, isSelected, onClick }: SlideCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative w-full aspect-square rounded-lg overflow-hidden border-2 transition-all text-left
        ${isSelected
          ? 'border-white'
          : 'border-zinc-700 hover:border-zinc-500'
        }
      `}
    >
      {/* 배경 이미지 */}
      {slide.image_url ? (
        <img
          src={slide.image_url}
          alt={slide.title ?? ''}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-zinc-800" />
      )}

      {/* 오버레이 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* 슬라이드 번호 */}
      <span className="absolute top-2 left-2 text-xs text-zinc-400 font-mono">
        {String(slide.slide_number).padStart(2, '0')}
      </span>

      {/* 텍스트 */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        {slide.title && (
          <p className="text-white text-xs font-medium leading-tight truncate">
            {slide.title}
          </p>
        )}
        {slide.text_content && (
          <p className="text-zinc-400 text-[10px] leading-tight mt-0.5 line-clamp-2">
            {slide.text_content}
          </p>
        )}
      </div>
    </button>
  )
}
