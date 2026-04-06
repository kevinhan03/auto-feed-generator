import { useState, useCallback } from 'react'
import type { BrandResearch, Slide } from '../types'

export const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SLIDE_GENERATION_PROMPT = (r: BrandResearch) => `
너는 패션 인스타그램 계정 @pyeonzipshop의 에디터야.
아래 브랜드 리서치 데이터를 바탕으로 13장짜리 인스타그램 슬라이드 텍스트를 작성해.

## 브랜드 리서치
- 브랜드명: ${r.brandName}
- 설립: ${r.founded}
- 창립자: ${r.founder}
- 브랜드 철학: ${r.philosophy}
- 핵심 키워드: ${r.keywords.join(', ')}
- 시그니처 디테일: ${r.signatureDetails}
- 디깅 포인트: ${r.diggingPoint}
- 무드: ${r.moodDescription}

## 슬라이드 구성 (13장 고정)
1장 — 후킹 문구: 브랜드를 한 줄로 정의. 스크롤을 멈추게 만드는 문장.
2장 — 브랜드 역사: 창립 배경과 기원 스토리.
3장 — 브랜드 철학 & 무드: 이 브랜드가 추구하는 것.
4장 — 핵심 키워드 & 디자인 DNA: 브랜드를 관통하는 미학적 언어.
5장 — 시그니처 디테일 & 디깅 포인트: 아는 사람만 아는 것들.
6장 — 시그니처 아이템 #1: 상품명, 가격대, 한 줄 설명.
7장 — 시그니처 아이템 #2: 상품명, 가격대, 한 줄 설명.
8장 — 시그니처 아이템 #3: 상품명, 가격대, 한 줄 설명.
9장 — 에디터 픽 #1: 상품명, 가격대, 에디터가 추천하는 이유.
10장 — 에디터 픽 #2: 상품명, 가격대, 에디터가 추천하는 이유.
11장 — 에디터 픽 #3: 상품명, 가격대, 에디터가 추천하는 이유.
12장 — 브랜드 총 요약 + 한 줄 총평: 이 브랜드를 한마디로 정리.
13장 — 마무리: size-picker 사이트(사이즈 추천 서비스) 소개 + 팔로우/저장 CTA.

## 작성 규칙
- 톤: 쿨하고 담담하게. 과장 없이, 아는 사람만 아는 느낌.
- 이모지: 13장 전체 합산 3개 이하.
- 각 슬라이드 텍스트(text_content)는 3~5문장 이내.
- 응답은 JSON 배열만 반환. 마크다운 코드블록, 부가 설명 일절 금지.

## 반환 형식
[
  {
    "slide_number": 1,
    "title": "슬라이드 제목 (짧게)",
    "text_content": "슬라이드 본문 텍스트",
    "image_prompt": "A concise English description of the ideal image for this slide, suitable for AI image generation"
  },
  ...
]
`.trim()

// ─── Core function ────────────────────────────────────────────────────────────

type SlidePayload = Pick<Slide, 'slide_number' | 'title' | 'text_content' | 'image_prompt'>

export async function generateSlides(research: BrandResearch): Promise<Slide[]> {
  if (!CLAUDE_API_KEY) {
    throw new Error('VITE_CLAUDE_API_KEY가 설정되지 않았습니다.')
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: SLIDE_GENERATION_PROMPT(research),
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API 오류 (${response.status}): ${errorBody}`)
  }

  const data = await response.json()

  const rawText: string | undefined = data?.content?.[0]?.text

  if (!rawText) {
    throw new Error('Claude 응답에서 텍스트를 찾을 수 없습니다.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error(`JSON 파싱 실패: ${rawText}`)
  }

  if (!Array.isArray(parsed) || parsed.length !== 13) {
    throw new Error(`슬라이드가 13장이어야 합니다. 실제 수신: ${Array.isArray(parsed) ? parsed.length : '배열 아님'}`)
  }

  return (parsed as SlidePayload[]).map((slide, index) => ({
    id: crypto.randomUUID(),
    post_id: null,
    slide_number: index + 1,
    title: slide.title ?? null,
    text_content: slide.text_content ?? null,
    image_url: null,
    image_prompt: slide.image_prompt ?? null,
    text_layout: null,
    updated_at: new Date().toISOString(),
  }))
}

// ─── Image recommendation ────────────────────────────────────────────────────

const IMAGE_RECOMMEND_PROMPT = (slide: Slide) => `
너는 패션 인스타그램 계정의 아트 디렉터야.
아래 슬라이드 내용을 보고 어떤 이미지가 가장 잘 어울릴지 한국어로 구체적으로 추천해줘.

슬라이드 제목: ${slide.title ?? '없음'}
슬라이드 본문: ${slide.text_content ?? '없음'}
AI 프롬프트 (참고): ${slide.image_prompt ?? '없음'}

다음 항목을 포함해서 3~4문장으로 답해줘:
- 어떤 피사체 / 장면
- 색감, 분위기, 조명
- 구도 또는 프레이밍
- 실제로 검색하거나 촬영할 때 쓸 수 있는 구체적인 키워드

담담하고 전문적인 톤. 과장 없이.
`.trim()

export async function recommendImage(slide: Slide): Promise<string> {
  if (!CLAUDE_API_KEY) throw new Error('VITE_CLAUDE_API_KEY가 설정되지 않았습니다.')

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: IMAGE_RECOMMEND_PROMPT(slide) }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API 오류 (${response.status}): ${err}`)
  }

  const data = await response.json()
  const text: string | undefined = data?.content?.[0]?.text
  if (!text) throw new Error('Claude 응답에서 텍스트를 찾을 수 없습니다.')
  return text.trim()
}

// ─── Caption generation ──────────────────────────────────────────────────────

const CAPTION_PROMPT = (slides: Slide[]) => `
너는 패션 인스타그램 계정 @pyeonzipshop의 에디터야.
아래 슬라이드 내용을 바탕으로 인스타그램 게시물 캡션과 해시태그를 작성해.

## 슬라이드 내용
${slides.map(s => `${s.slide_number}장: ${s.title ?? ''} — ${s.text_content ?? ''}`).join('\n')}

## 작성 규칙
- 캡션: 브랜드를 소개하는 200자 내외, 쿨하고 담담한 톤
- 이모지: 2개 이하
- 해시태그: 30개, 영문/한글 혼용, # 없이 단어만
- 응답은 JSON만 반환. 마크다운 코드블록 금지.

## 반환 형식
{"caption": "캡션 텍스트", "hashtags": ["태그1", "태그2"]}
`.trim()

export async function generateCaption(slides: Slide[]): Promise<{ caption: string; hashtags: string[] }> {
  if (!CLAUDE_API_KEY) throw new Error('VITE_CLAUDE_API_KEY가 설정되지 않았습니다.')

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: CAPTION_PROMPT(slides) }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API 오류 (${response.status}): ${err}`)
  }

  const data = await response.json()
  const rawText: string | undefined = data?.content?.[0]?.text
  if (!rawText) throw new Error('Claude 응답에서 텍스트를 찾을 수 없습니다.')

  const match = rawText.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('캡션 JSON 파싱 실패')
  return JSON.parse(match[0])
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseGenerateSlidesState {
  slides: Slide[] | null
  loading: boolean
  error: string | null
}

interface UseGenerateSlidesReturn extends UseGenerateSlidesState {
  generate: (research: BrandResearch) => Promise<void>
  reset: () => void
}

export function useGenerateSlides(): UseGenerateSlidesReturn {
  const [state, setState] = useState<UseGenerateSlidesState>({
    slides: null,
    loading: false,
    error: null,
  })

  const generate = useCallback(async (research: BrandResearch) => {
    setState({ slides: null, loading: true, error: null })
    try {
      const slides = await generateSlides(research)
      setState({ slides, loading: false, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      setState({ slides: null, loading: false, error: message })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ slides: null, loading: false, error: null })
  }, [])

  return { ...state, generate, reset }
}
