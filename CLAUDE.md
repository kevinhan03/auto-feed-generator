# Auto Feed Generator

패션 인스타그램 계정 @pyeonzipshop을 위한 브랜드 피드 자동 생성 도구.
브랜드명 + 공식 홈페이지를 입력하면 리서치 → 슬라이드 콘텐츠 생성 → 편집 → 미리보기 흐름으로 인스타그램 캐러셀 포스트를 만든다.

## 기술 스택

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Routing**: React Router DOM v6
- **DB / Storage**: Supabase (PostgreSQL + Storage)
- **AI - 리서치**: Google Gemini 2.5 Flash (Google Search Grounding 사용)
- **AI - 콘텐츠**: Anthropic Claude Sonnet 4.6 (슬라이드 생성, 캡션 생성, 이미지 추천)

## 주요 명령어

```bash
npm run dev      # 개발 서버 (localhost:5173)
npm run build    # 타입 체크 + 프로덕션 빌드
npm run lint     # ESLint
npm run preview  # 빌드 결과 미리보기
```

## 환경 변수 (.env.local)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
VITE_CLAUDE_API_KEY=
```

Claude API는 브라우저 직접 호출 방식 사용 → `anthropic-dangerous-direct-browser-access: true` 헤더 필수.
Vite 프록시를 통해 `/api/anthropic` → `https://api.anthropic.com` 으로 라우팅.

## 파일 구조

```
src/
  lib/
    claude.ts       # Claude API: 슬라이드 생성, 캡션 생성, 이미지 추천
    gemini.ts       # Gemini API: 브랜드 리서치 (Google Search Grounding)
    supabase.ts     # Supabase 클라이언트
  pages/
    Dashboard.tsx   # 포스트 목록, 검색, 삭제
    NewPost.tsx     # 4단계 위저드 (브랜드 입력 → 리서치 → 슬라이드 생성 → 저장)
    SlideEditor.tsx # 슬라이드 편집, 이미지 업로드, 캡션/해시태그 생성
    Preview.tsx     # 인스타그램 스타일 미리보기
    ImageGen.tsx    # (미구현)
  components/
    SlideCard.tsx   # 슬라이드 썸네일 카드
    ImageUploader.tsx # 드래그앤드롭 이미지 업로드 (Supabase Storage)
  types/
    index.ts        # BrandResearch, Brand, Post, Slide 타입 정의
```

## Supabase 스키마

```sql
brands (id, brand_name, research_data jsonb, created_at)
posts  (id, brand_id → brands, status, caption, hashtags text[], created_at)
slides (id, post_id → posts, slide_number int NOT NULL, title, text_content,
        image_url, image_prompt, updated_at)
```

Storage 버킷: `slide-images` (public)
이미지 경로: `slides/{slideId}` (확장자 없음, contentType 헤더로 처리)

## 주요 흐름

### 신규 포스트 생성 (NewPost)
1. 브랜드명 + 공식 홈페이지(선택) 입력
2. Gemini가 Google Search Grounding으로 브랜드 리서치 → JSON 반환
3. 리서치 결과 클릭-인라인-편집으로 교차 검증
4. Claude가 13장 슬라이드 텍스트 + 이미지 프롬프트 생성
5. Supabase에 brand → post → slides 순으로 저장
6. SlideEditor로 이동

### 임시저장 / 이어서 편집
- 어느 단계에서든 "임시저장" → Dashboard로 이동
- Dashboard에서 draft 포스트 클릭 → `/new-post?postId=` → 기존 데이터 로드해서 이어서 편집
- 슬라이드가 이미 있는 draft → SlideEditor로 리다이렉트

### 슬라이드 편집 (SlideEditor)
- 제목, 본문, 이미지 프롬프트 인라인 편집
- 이미지 드래그앤드롭 업로드
- Claude 이미지 추천 (슬라이드 내용 기반)
- 캡션 + 해시태그 자동 생성 (Claude)
- 저장 시 `posts.status` → `'ready'`로 업데이트

## 코드 컨벤션

- 컴포넌트는 각 페이지 파일 하단에 private 함수로 정의 (별도 파일 분리 최소화)
- API 호출 함수는 `lib/` 에, 훅은 같은 파일 하단에 위치
- Supabase 조인 쿼리 대신 분리 쿼리 사용 (FK 설정 의존성 제거)
- 모든 UI 문자열은 한국어
- Tailwind 클래스는 인라인, 별도 CSS 파일 최소화

## 알려진 제한사항

- Claude / Gemini API 키가 프론트엔드에 노출됨 (개인 도구이므로 허용)
- 슬라이드 저장이 단일 upsert라 중간 실패 시 부분 저장 가능
- ImageGen 페이지 미구현
- 인증 없음 (개인 사용 목적)
