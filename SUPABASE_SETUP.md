# Supabase

## 연결 상태

- 조직: `Blockfall` (Free)
- 프로젝트: [`blockfall`](https://supabase.com/dashboard/project/isfrpkkebwwnyevwoiba), 서울 리전 (`ap-northeast-2`)
- 브라우저 연결: `supabase-config.js`에 프로젝트 URL과 publishable key 설정
- DB: 프로필, 점수, 프로필 이미지 생성 한도, 인덱스, RLS 정책 및 신규 사용자 프로필 트리거 적용
- Auth: 이메일/비밀번호 가입 사용, 이메일 확인 비활성화, Vercel 사이트 URL 등록
- Storage: 공개 `avatars` 버킷에 생성된 WebP 이미지 저장

프론트엔드에는 publishable 공개 키만 사용합니다. Supabase `service_role` 또는 secret 키를 브라우저 코드에 넣지 마세요. DB 정책은 점수와 닉네임 공개 조회를 허용하고, 점수 등록은 본인 계정으로만 제한합니다.

## DB 변경 적용

스키마는 `supabase/migrations/`의 마이그레이션으로 관리합니다. 프로젝트에 연결된 Supabase CLI에서 아래 명령으로 추가 변경을 적용할 수 있습니다.

```powershell
npx supabase db push --remote
```

로컬 CLI 설정은 `supabase/config.toml`에 있습니다. 프로젝트는 Free 요금제이며, Supabase Free 프로젝트는 비활동 상태가 1주 지속되면 일시 중지될 수 있습니다.

## GPT Image 2 프로필 이미지

`api/generate-avatar.js`가 로그인 토큰을 검증하고 GPT Image 2로 이미지를 만듭니다. 서버는 Supabase Storage에 결과를 저장하고 프로필에 이미지 경로를 기록합니다. 생성 요청은 계정당 하루 3회, 서비스 전체 하루 30회로 제한됩니다. 날짜는 한국 시간 자정에 바뀌며 실패한 요청도 한도에 포함됩니다.

Vercel Production 환경 변수 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`가 설정되어 있습니다. 키를 바꾸면 Vercel 프로젝트의 **Settings → Environment Variables**에서 Production Secret을 갱신하고 새 배포를 실행합니다. 이 키는 브라우저 코드나 Git 저장소에 넣지 않습니다.

프로필 이미지 생성에는 OpenAI API 사용 비용이 발생합니다. 현재 앱은 이미지 생성에 `gpt-image-2`, 1024×1024, medium 품질, WebP 형식을 사용합니다.
