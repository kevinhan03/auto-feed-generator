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
  created_at: string
}

export type PostInsert = Omit<Post, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

export type PostUpdate = Partial<Omit<Post, 'id' | 'created_at'>>

// ─── Slide ───────────────────────────────────────────────────────────────────

export interface Slide {
  id: string
  post_id: string | null
  slide_number: number
  title: string | null
  text_content: string | null
  image_url: string | null
  image_prompt: string | null
  updated_at: string
}

export type SlideInsert = Omit<Slide, 'id' | 'updated_at'> & {
  id?: string
  updated_at?: string
}

export type SlideUpdate = Partial<Omit<Slide, 'id' | 'updated_at'>>
