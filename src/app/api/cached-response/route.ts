import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exampleQueries } from '@/lib/example-queries';

// GET - Check if cached response exists for a question
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const questionId = searchParams.get('questionId');
  const questionText = searchParams.get('questionText');

  if (!questionId && !questionText) {
    return NextResponse.json({ error: 'questionId or questionText required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find question ID if only text provided
    let qId = questionId ? parseInt(questionId) : null;
    if (!qId && questionText) {
      const index = exampleQueries.findIndex(q => q === questionText);
      if (index !== -1) {
        qId = index + 1; // 1-based index
      }
    }

    if (!qId) {
      // Not an example question - no cache available
      return NextResponse.json({ cached: false, reason: 'not_example_question' });
    }

    // Check cache
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cache, error: cacheError } = await (supabase.from('cached_responses') as any)
      .select('*')
      .eq('question_id', qId)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (cacheError || !cache) {
      return NextResponse.json({ 
        cached: false, 
        reason: 'no_cache',
        questionId: qId 
      });
    }

    // Increment hit count (fire and forget)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('increment_cache_hit', { p_question_id: qId }).then(() => {});

    return NextResponse.json({
      cached: true,
      questionId: qId,
      response: cache.response,
      courtCases: cache.court_cases,
      createdAt: cache.created_at,
      expiresAt: cache.expires_at,
      hitCount: (cache.hit_count || 0) + 1,
    });

  } catch (error) {
    console.error('Cache check error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST - Save response to cache (called after generation)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { questionId, questionText, response, courtCases } = body;

    if (!questionId || !response) {
      return NextResponse.json({ error: 'questionId and response required' }, { status: 400 });
    }

    // Verify it's a valid example question (1-100)
    if (questionId < 1 || questionId > exampleQueries.length) {
      return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 });
    }

    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Upsert cache entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('cached_responses') as any)
      .upsert({
        question_id: questionId,
        question_text: questionText || exampleQueries[questionId - 1],
        response: response,
        court_cases: courtCases || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
        hit_count: 0,
        last_hit_at: null,
      }, {
        onConflict: 'question_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Cache save error:', error);
      return NextResponse.json({ error: 'Failed to save cache' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      questionId,
      expiresAt: data?.expires_at 
    });

  } catch (error) {
    console.error('Cache save error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE - Invalidate cache for a question (for manual refresh)
export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const questionId = searchParams.get('questionId');

  if (!questionId) {
    return NextResponse.json({ error: 'questionId required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('cached_responses') as any)
      .delete()
      .eq('question_id', parseInt(questionId));

    if (error) {
      console.error('Cache delete error:', error);
      return NextResponse.json({ error: 'Failed to delete cache' }, { status: 500 });
    }

    return NextResponse.json({ success: true, questionId: parseInt(questionId) });

  } catch (error) {
    console.error('Cache delete error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
