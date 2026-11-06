# Supabase

## 연결 상태

- 조직: `Blockfall` (Free)
- 프로젝트: [`blockfall`](https://supabase.com/dashboard/project/isfrpkkebwwnyevwoiba), 서울 리전 (`ap-northeast-2`)
- 브라우저 연결: `supabase-config.js`에 프로젝트 URL과 publishable key 설정
- DB: 프로필, 점수 테이블, 인덱스, RLS 정책 및 신규 사용자 프로필 트리거 적용
- Auth: 이메일/비밀번호 가입 사용, 이메일 확인 비활성화, Vercel 사이트 URL 등록

프론트엔드에는 publishable 공개 키만 사용합니다. Supabase `service_role` 또는 secret 키를 브라우저 코드에 넣지 마세요. DB 정책은 점수와 닉네임 공개 조회를 허용하고, 점수 등록은 본인 계정으로만 제한합니다.

## DB 변경 적용

스키마는 `supabase/migrations/`의 마이그레이션으로 관리합니다. 프로젝트에 연결된 Supabase CLI에서 아래 명령으로 추가 변경을 적용할 수 있습니다.

```powershell
npx supabase db push --remote
```

로컬 CLI 설정은 `supabase/config.toml`에 있습니다. 프로젝트는 Free 요금제이며, Supabase Free 프로젝트는 비활동 상태가 1주 지속되면 일시 중지될 수 있습니다.
