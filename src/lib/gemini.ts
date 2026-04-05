import { useState, useCallback } from 'react'
import type { BrandResearch } from '../types'

export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta'

const MODEL = 'gemini-2.5-flash'

const BRAND_RESEARCH_PROMPT = (brandName: string, brandUrl?: string) => `
다음 패션 브랜드에 대한 정보를 JSON 형식으로 반환해줘. 반드시 최신 검색 결과를 기반으로 사실만 작성해.

브랜드명: ${brandName}${brandUrl ? `\n공식 홈페이지: ${brandUrl}` : ''}
${brandUrl ? `\n공식 홈페이지 URL이 제공됐으니 해당 사이트를 우선 참고해서 정확한 정보를 추출해. 브랜드명이 모호하거나 동명이인이 있을 경우 이 URL로 정확한 브랜드를 특정해.` : ''}
반드시 아래 JSON 구조만 반환하고, 마크다운 코드블록이나 부가 설명 없이 순수 JSON만 출력해.

{
  "brandName": "브랜드명",
  "founded": "설립 연도 및 국가 (예: 1991년, 벨기에)",
  "founder": "창립자 이름",
  "philosophy": "브랜드 철학을 2~3문장으로 설명",
  "keywords": ["핵심 키워드 1", "핵심 키워드 2", "핵심 키워드 3", "핵심 키워드 4", "핵심 키워드 5"],
  "signatureDetails": "이 브랜드를 대표하는 시그니처 디자인 요소나 디테일",
  "diggingPoint": "패션을 좋아하는 사람이 흥미를 느낄 만한 잘 알려지지 않은 사실이나 관점",
  "moodDescription": "브랜드 전반적인 분위기와 무드를 감각적으로 묘사"
}

조건:
- 패션을 좋아하는 사람 관점에서 흥미로운 정보 위주로 추출
- 한국어로 응답
- 과장 없이 담담한 톤
`.trim()

function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1].trim()
  const jsonObject = text.match(/\{[\s\S]*\}/)
  if (jsonObject) return jsonObject[0]
  return text.trim()
}

export async function fetchBrandResearch(brandName: string, brandUrl?: string): Promise<BrandResearch> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY가 설정되지 않았습니다.')
  }

  const url = `${GEMINI_API_URL}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: BRAND_RESEARCH_PROMPT(brandName, brandUrl) }] }],
      tools: [{ googleSearch: {} }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini API 오류 (${response.status}): ${errorBody}`)
  }

  const data = await response.json()

  const rawText: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!rawText) {
    throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(rawText))
  } catch {
    throw new Error(`JSON 파싱 실패: ${rawText}`)
  }

  const result = parsed as BrandResearch
  result.keywords = [...new Set(result.keywords)]
  return result
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseGeminiResearchState {
  data: BrandResearch | null
  loading: boolean
  error: string | null
}

interface UseGeminiResearchReturn extends UseGeminiResearchState {
  research: (brandName: string, brandUrl?: string) => Promise<void>
  reset: () => void
}

export function useGeminiResearch(): UseGeminiResearchReturn {
  const [state, setState] = useState<UseGeminiResearchState>({
    data: null,
    loading: false,
    error: null,
  })

  const research = useCallback(async (brandName: string, brandUrl?: string) => {
    setState({ data: null, loading: true, error: null })
    try {
      const data = await fetchBrandResearch(brandName, brandUrl)
      setState({ data, loading: false, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
      setState({ data: null, loading: false, error: message })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, research, reset }
}
