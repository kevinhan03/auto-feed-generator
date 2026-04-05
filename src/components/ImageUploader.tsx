import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface ImageUploaderProps {
  slideId: string
  currentImageUrl: string | null
  onUpload: (url: string) => void
}

export default function ImageUploader({ slideId, currentImageUrl, onUpload }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.')
      return
    }

    setUploading(true)
    setError(null)

    const path = `slides/${slideId}`

    const { error: uploadError } = await supabase.storage
      .from('slide-images')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      setError(`업로드 실패: ${uploadError.message}`)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('slide-images').getPublicUrl(path)
    onUpload(data.publicUrl)
    setUploading(false)
  }, [slideId, onUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  return (
    <div className="space-y-2">
      {/* 현재 이미지 미리보기 */}
      {currentImageUrl && (
        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-zinc-800">
          <img
            src={currentImageUrl}
            alt="현재 이미지"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* 업로드 영역 */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-2
          aspect-square w-full rounded-lg border-2 border-dashed cursor-pointer
          transition-colors select-none
          ${isDragging
            ? 'border-white bg-zinc-800'
            : 'border-zinc-600 bg-zinc-900 hover:border-zinc-400 hover:bg-zinc-800'
          }
          ${currentImageUrl ? 'aspect-auto py-6' : 'aspect-square'}
        `}
      >
        {uploading ? (
          <span className="text-sm text-zinc-400">업로드 중...</span>
        ) : (
          <>
            <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="text-xs text-zinc-500">
              {currentImageUrl ? '이미지 교체' : '이미지 업로드'}
            </span>
            <span className="text-[10px] text-zinc-600">드래그앤드롭 또는 클릭</span>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
