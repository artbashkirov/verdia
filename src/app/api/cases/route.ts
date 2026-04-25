import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: cases, error } = await supabase
      .from('cases')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching cases:', error);
      return NextResponse.json({ error: 'Failed to fetch cases' }, { status: 500 });
    }

    return NextResponse.json({ cases });
  } catch (error) {
    console.error('Cases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, case_type = 'objection', source_chat_id } = body;

    const { data: newCaseRaw, error } = await supabase
      .from('cases')
      .insert({
        user_id: user.id,
        title: title || 'Новое дело',
        description: description || null,
        case_type,
        status: 'draft',
        source_chat_id: source_chat_id || null,
      } as never)
      .select()
      .single();

    if (error) {
      console.error('Error creating case:', error);
      return NextResponse.json({ error: 'Failed to create case' }, { status: 500 });
    }

    const newCase = newCaseRaw as { id: string };

    if (description) {
      await supabase.from('case_messages').insert({
        case_id: newCase.id,
        user_id: user.id,
        role: 'user',
        content: description,
        message_type: 'message',
      } as never);
    }

    return NextResponse.json({ case: newCaseRaw }, { status: 201 });
  } catch (error) {
    console.error('Cases POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
