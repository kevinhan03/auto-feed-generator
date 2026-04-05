import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Post } from '../types'

type PostWithBrand = Post & { brands: { brand_name: string } | null }
type FilterStatus = 'all' | Post['status']

const STATUS_LABEL: Record<Post['status'], string> = {
  draft: 'Draft',
  ready: 'Ready',
  published: 'Published',
}

const STATUS_COLOR: Record<Post['status'], string> = {
  draft: 'bg-zinc-700 text-zinc-400',
  ready: 'bg-blue-900/60 text-blue-300',
  published: 'bg-green-900/60 text-green-300',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState<PostWithBrand[]>([])
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('posts')
      .select('*, brands(brand_name)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setPosts((data ?? []) as PostWithBrand[])
        setLoading(false)
      })
  }, [])

  const handleDelete = async (postId: string) => {
    if (!window.confirm('이 포스트를 삭제할까요?')) return
    await supabase.from('slides').delete().eq('post_id', postId)
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (!error) setPosts(prev => prev.filter(p => p.id !== postId))
  }

  const filtered = posts.filter(p => {
    const matchStatus = filter === 'all' || p.status === filter
    const matchSearch = !search.trim() ||
      (p.brands?.brand_name ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-lg font-semibold tracking-tight">포스트</h1>
          <button
            onClick={() => navigate('/new-post')}
            className="px-4 py-2 bg-white text-zinc-950 text-sm font-medium rounded-lg
              hover:bg-zinc-200 transition-colors"
          >
            + 새 포스트 만들기
          </button>
        </div>

        {/* 검색 + 필터 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="브랜드명으로 검색"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2
              text-white placeholder:text-zinc-600 text-sm outline-none
              focus:border-zinc-600 transition-colors"
          />
          <div className="flex gap-2">
            {(['all', 'draft', 'ready', 'published'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === s
                    ? 'bg-white text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {s === 'all' ? '전체' : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* 콘텐츠 */}
        {loading ? (
          <p className="text-zinc-500 text-sm">불러오는 중...</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-zinc-600 text-sm mb-4">
              {search ? `"${search}"에 해당하는 포스트가 없습니다.` : '포스트가 없습니다.'}
            </p>
            {!search && (
              <button
                onClick={() => navigate('/new-post')}
                className="text-zinc-400 text-sm underline underline-offset-2 hover:text-white transition-colors"
              >
                첫 번째 포스트 만들기
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onEdit={() =>
                  post.status === 'draft'
                    ? navigate(`/new-post?postId=${post.id}`)
                    : navigate(`/slide-editor?postId=${post.id}`)
                }
                onPreview={() => navigate(`/preview?postId=${post.id}`)}
                onDelete={() => handleDelete(post.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PostCard({
  post,
  onEdit,
  onPreview,
  onDelete,
}: {
  post: PostWithBrand
  onEdit: () => void
  onPreview: () => void
  onDelete: () => void
}) {
  const brandName = post.brands?.brand_name ?? '브랜드 없음'
  const date = new Date(post.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3
      hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-white font-medium text-sm leading-snug">{brandName}</p>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[post.status]}`}>
          {STATUS_LABEL[post.status]}
        </span>
      </div>
      <p className="text-zinc-600 text-xs">{date}</p>
      <div className="mt-auto flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300
            text-sm rounded-lg transition-colors"
        >
          편집
        </button>
        {post.status !== 'draft' && (
          <button
            onClick={onPreview}
            className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300
              text-sm rounded-lg transition-colors"
          >
            미리보기
          </button>
        )}
        <button
          onClick={onDelete}
          className="px-3 py-2 bg-zinc-800 hover:bg-red-950 hover:text-red-400
            text-zinc-600 text-sm rounded-lg transition-colors"
          title="삭제"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
