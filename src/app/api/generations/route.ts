import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/generations
//   — без параметров: возвращает список всех чатов пользователя
//     (id, query, response, created_at) для рендера истории в сайдбаре.
//   — с параметром `?ids=id1,id2`: возвращает только эти id (для polling
//     по чатам со статусом "generating"). Лимит 50 id за один запрос.
//
// Серверный роут используется вместо браузерного Supabase-клиента,
// который иногда залипает на refresh-токене. Это убирает классы багов
// "история чатов не загружается" и "сайдбар висит на спиннере".
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    const idsParam = request.nextUrl.searchParams.get('ids');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('generations')
      .select('id, query, response, created_at')
      .eq('user_id', user.id);

    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 50);

      if (ids.length === 0) {
        return NextResponse.json({ generations: [] });
      }

      query = query.in('id', ids);
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Generations GET error:', error);
      return NextResponse.json({ error: 'Не удалось загрузить чаты' }, { status: 500 });
    }

    return NextResponse.json({ generations: data ?? [] });
  } catch (error) {
    console.error('Generations GET unexpected error:', error);
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 });
  }
}

// DELETE /api/generations — удаляет ВСЕ чаты текущего пользователя.
// Используется для пункта "Очистить историю" в сайдбарах.
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    const { error } = await supabase
      .from('generations')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Generations DELETE error:', error);
      return NextResponse.json({ error: 'Не удалось очистить историю' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Generations DELETE unexpected error:', error);
    return NextResponse.json({ error: 'Произошла ошибка' }, { status: 500 });
  }
}
