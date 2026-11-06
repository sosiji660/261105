import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
const configured = Boolean(
  supabaseUrl?.startsWith('https://')
  && publishableKey?.startsWith('sb_publishable_')
  && serviceRoleKey?.startsWith('eyJ')
  && openaiKey?.startsWith('sk-')
);

function reply(status, body) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function serviceHeaders() {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
}

async function removeAvatar(path) {
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/avatars`, {
      method: 'DELETE',
      headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] })
    });
  } catch (error) {
    console.error('Avatar cleanup failed:', error?.message);
  }
}

export function GET() {
  return reply(200, { enabled: configured });
}

export async function POST(request) {
  if (!configured) {
    return reply(503, { error: '이미지 생성 기능을 준비 중입니다.' });
  }

  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(authorization)) {
    return reply(401, { error: '로그인이 필요합니다.' });
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return reply(415, { error: '요청 형식을 확인해 주세요.' });
  }

  let prompt;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply(413, { error: '설명을 200자 이내로 작성해 주세요.' });
    prompt = JSON.parse(raw).prompt?.trim();
  } catch (_) {
    return reply(400, { error: '이미지 설명을 확인해 주세요.' });
  }
  if (typeof prompt !== 'string' || prompt.length < 4 || prompt.length > 200) {
    return reply(400, { error: '이미지 설명을 4~200자로 작성해 주세요.' });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: authorization }
    });
    if (!userResponse.ok) return reply(401, { error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    const user = await userResponse.json();
    if (!/^[0-9a-f-]{36}$/i.test(user.id || '')) return reply(401, { error: '사용자 정보를 확인할 수 없습니다.' });

    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=avatar_path&id=eq.${user.id}&limit=1`, {
      headers: serviceHeaders()
    });
    if (!profileResponse.ok) return reply(502, { error: '프로필을 불러오지 못했습니다.' });
    const [profile] = await profileResponse.json();
    if (!profile) return reply(404, { error: '프로필을 찾지 못했습니다.' });
    const previousPath = profile.avatar_path;

    const quotaResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_avatar_generation`, {
      method: 'POST',
      headers: { ...serviceHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: user.id })
    });
    if (!quotaResponse.ok) {
      const detail = await quotaResponse.json().catch(() => ({}));
      if (detail.message === 'USER_DAILY_LIMIT') return reply(429, { error: '하루 생성 한도 3회에 도달했습니다.' });
      if (detail.message === 'GLOBAL_DAILY_LIMIT') return reply(429, { error: '오늘의 이미지 생성 한도가 모두 사용되었습니다.' });
      console.error('Avatar quota failed:', quotaResponse.status);
      return reply(502, { error: '생성 한도를 확인하지 못했습니다.' });
    }

    const imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: `Create one square profile avatar for a Tetris player's account. The user's visual idea: ${prompt}. Make it a polished single-character or icon portrait, centered, clear at small sizes, with no letters, words, logos, or watermarks.`,
        size: '1024x1024',
        quality: 'medium',
        output_format: 'webp',
        output_compression: 80,
        n: 1,
        safety_identifier: user.id
      }),
      signal: AbortSignal.timeout(100000)
    });
    if (!imageResponse.ok) {
      console.error('OpenAI image generation failed:', imageResponse.status, imageResponse.headers.get('x-request-id'));
      if (imageResponse.status === 401 || imageResponse.status === 403) return reply(503, { error: '이미지 생성 서비스 설정을 확인해 주세요.' });
      if (imageResponse.status === 429) return reply(429, { error: '이미지 생성 요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
      return reply(502, { error: '이미지를 생성하지 못했습니다.' });
    }

    const imageData = await imageResponse.json();
    const encodedImage = imageData.data?.[0]?.b64_json;
    if (typeof encodedImage !== 'string') return reply(502, { error: '이미지 결과를 받지 못했습니다.' });
    const imageBytes = Buffer.from(encodedImage, 'base64');
    if (!imageBytes.length || imageBytes.length > 5242880) return reply(502, { error: '생성된 이미지 크기를 처리할 수 없습니다.' });

    const path = `${user.id}/${randomUUID()}.webp`;
    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${path}`, {
      method: 'POST',
      headers: { ...serviceHeaders(), 'Content-Type': 'image/webp', 'cache-control': '3600' },
      body: imageBytes
    });
    if (!uploadResponse.ok) {
      console.error('Avatar upload failed:', uploadResponse.status);
      return reply(502, { error: '이미지 저장에 실패했습니다.' });
    }

    const updateResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ avatar_path: path })
    });
    const updated = updateResponse.ok ? await updateResponse.json() : [];
    if (!updated.length) {
      await removeAvatar(path);
      console.error('Avatar profile update failed:', updateResponse.status);
      return reply(502, { error: '프로필 이미지 등록에 실패했습니다.' });
    }

    if (previousPath?.startsWith(`${user.id}/`) && previousPath !== path) await removeAvatar(previousPath);
    return reply(200, { avatarUrl: `${supabaseUrl}/storage/v1/object/public/avatars/${path}` });
  } catch (error) {
    console.error('Avatar request failed:', error?.message);
    return reply(502, { error: '이미지 생성 중 연결 오류가 발생했습니다.' });
  }
}
