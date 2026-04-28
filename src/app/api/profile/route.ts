import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/types/database';

// GET /api/profile — возвращает профиль текущего пользователя.
// Серверный роут используется вместо браузерного Supabase-клиента,
// который иногда подвисает на refresh-токене (особенно на мобильных
// браузерах) и блокирует загрузку страницы профиля.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Profile GET error:', error);
      return NextResponse.json(
        { error: 'Не удалось загрузить профиль' },
        { status: 500 }
      );
    }

    // Профиль может быть null — это нормальный случай для нового пользователя,
    // фронт сам инициализирует пустую форму.
    return NextResponse.json({ profile: data ?? null });
  } catch (error) {
    console.error('Profile GET unexpected error:', error);
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 });
  }
}

// POST /api/profile — upsert профиля текущего пользователя.
// Тело запроса: { profile: Partial<UserProfile> }
// person_type и любые поля из UserProfile.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    let body: { profile?: Partial<UserProfile> };
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('Profile POST: invalid JSON', parseError);
      return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
    }

    const profile = body?.profile;
    if (!profile || typeof profile !== 'object') {
      return NextResponse.json({ error: 'Не передан профиль' }, { status: 400 });
    }

    // Защита от подмены user_id из тела запроса.
    const profileToUpsert = {
      ...profile,
      user_id: user.id,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('user_profiles') as any)
      .upsert(profileToUpsert, { onConflict: 'user_id' });

    if (error) {
      console.error('Profile POST upsert error:', error);
      return NextResponse.json({ error: 'Ошибка сохранения профиля' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Profile POST unexpected error:', error);
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 });
  }
}
