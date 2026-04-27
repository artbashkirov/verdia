import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Returns a single generation by id for the authenticated user.
// Server-side fetch, used by the chat result page to avoid the
// browser Supabase client occasionally hanging on auth-token refresh.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'ID не указан' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('generations')
      .select('id, query, response, created_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      // PGRST116 = no rows returned
      const status = (error as { code?: string } | null)?.code === 'PGRST116' ? 404 : 500;
      if (status === 500) {
        console.error('Generation GET error:', error);
      }
      return NextResponse.json(
        { error: status === 404 ? 'Чат не найден' : 'Не удалось загрузить чат' },
        { status }
      );
    }

    return NextResponse.json({ generation: data });
  } catch (error) {
    console.error('Generation GET unexpected error:', error);
    return NextResponse.json(
      { error: 'Произошла ошибка' },
      { status: 500 }
    );
  }
}
