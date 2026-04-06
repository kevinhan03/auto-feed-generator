// ─── Gemini ──────────────────────────────────────────────────────────────────

export interface BrandResearch {
  brandName: string
  founded: string
  founder: string
  philosophy: string
  keywords: string[]
  signatureDetails: string
  diggingPoint: string
  moodDescription: string
}

// ─── Brand ───────────────────────────────────────────────────────────────────

export interface Brand {
  id: string
  brand_name: string
  research_data: Record<string, unknown> | null
  created_at: string
}

export type BrandInsert = Omit<Brand, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type BrandUpdate = Partial<Omit<Brand, 'id' | 'created_at'>>

// ─── Post ────────────────────────────────────────────────────────────────────

export type PostStatus = 'draft' | 'ready' | 'published'

export interface Post {
  id: string
  brand_id: string | null
  status: PostStatus
  caption: string | null
  hashtags: string[] | null
  logo_url: string | null
  created_at: string
}

export type PostInsert = Omit<Post, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type PostUpdate = Partial<Omit<Post, 'id' | 'created_at'>>

// ─── Slide ───────────────────────────────────────────────────────────────────

export interface TextPosition {
  x: number  // % from left
  y: number  // % from top
}

export interface LogoPosition {
  x: number     // % from left
  y: number     // % from top
  size: number  // % of canvas width
}

export interface TextLayout {
  title?: TextPosition
  body?: TextPosition
  titleColor?: string
  bodyColor?: string
  titleSize?: number   // px
  bodySize?: number    // px
  logoPos?: LogoPosition
}

export interface Slide {
  id: string
  post_id: string | null
  slide_number: number
  title: string | null
  text_content: string | null
  image_url: string | null
  image_prompt: string | null
  text_layout: TextLayout | null
  updated_at: string
}

export type SlideInsert = Omit<Slide, 'id' | 'updated_at'> & {
  id?: string
  updated_at?: string
}

export type SlideUpdate = Partial<Omit<Slide, 'id' | 'updated_at'>>
