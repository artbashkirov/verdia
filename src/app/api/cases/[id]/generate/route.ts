import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callAI } from '@/lib/openai';
import { getLawContext } from '@/lib/rag';
import { OBJECTION_GENERATION_PROMPT, buildCaseAnalysisContext } from '@/lib/case-prompts';
import { checkQualityGates } from '@/lib/quality-gates';
import type { GeneratedDocumentType, CaseMissingInfo } from '@/types/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const qualityGates = checkQualityGates({
      analysis: caseData.analysis || {},
      entities: caseData.entities || {},
      missingInfo: (caseData.missing_info || []) as CaseMissingInfo[],
      documentsCount: 0,
      extractedTextsAvailable: false,
    });

    const { data: documents } = await supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId)
      .eq('is_relevant', true);

    const docsCount = documents?.length || 0;
    const hasTexts = documents?.some(d => d.extracted_text && d.extracted_text.length > 0) || false;

    const fullGates = checkQualityGates({
      analysis: caseData.analysis || {},
      entities: caseData.entities || {},
      missingInfo: (caseData.missing_info || []) as CaseMissingInfo[],
      documentsCount: docsCount,
      extractedTextsAvailable: hasTexts,
    });

    if (!fullGates.passed) {
      await supabase.from('case_messages').insert({
        case_id: caseId,
        user_id: user.id,
        role: 'assistant',
        content: `Невозможно сгенерировать возражение. Не пройдены проверки качества:\n\n${fullGates.critical_failures.map(f => `❗ ${f}`).join('\n')}`,
        message_type: 'quality_gate',
      });

      return NextResponse.json({
        error: 'Quality gates not passed',
        quality_gates: fullGates,
      }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedStrategy = body.strategy || caseData.strategy || 'combined';

    const docsForContext = (documents || [])
      .filter(d => d.extracted_text)
      .map(d => ({
        file_name: d.file_name,
        extracted_text: d.extracted_text!,
        analysis: d.analysis,
      }));

    const { data: messages } = await supabase
      .from('case_messages')
      .select('role, content')
      .eq('case_id', caseId)
      .eq('message_type', 'message')
      .order('created_at', { ascending: true })
      .limit(20);

    let lawContext = '';
    try {
      const searchTerms = [
        caseData.analysis?.qualification,
        caseData.entities?.subject,
        caseData.description,
      ].filter(Boolean).join(' ');
      lawContext = await getLawContext(searchTerms, { matchCount: 7, matchThreshold: 0.3 });
    } catch {
      console.warn('RAG not available for document generation');
    }

    const context = buildCaseAnalysisContext({
      caseDescription: caseData.description || undefined,
      documents: docsForContext,
      chatHistory: (messages || []).map(m => ({ role: m.role, content: m.content })),
      caseType: caseData.case_type,
      lawContext: lawContext || undefined,
    });

    const additionalContext = `\n\nАнализ дела:\n${JSON.stringify(caseData.analysis, null, 2)}\n\nСущности дела:\n${JSON.stringify(caseData.entities, null, 2)}\n\nВыбранная стратегия: ${requestedStrategy}`;

    let generationResult;
    try {
      const rawResponse = await callAI(
        context + additionalContext,
        OBJECTION_GENERATION_PROMPT,
        6000
      );
      generationResult = JSON.parse(rawResponse);
    } catch (e) {
      console.error('Document generation AI error:', e);
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
    }

    const strategyToType: Record<string, GeneratedDocumentType> = {
      facts: 'objection_facts',
      law: 'objection_law',
      procedural: 'objection_procedural',
      combined: 'objection_combined',
    };

    const { data: lastVersion } = await supabase
      .from('case_generated_documents')
      .select('version')
      .eq('case_id', caseId)
      .eq('document_type', strategyToType[requestedStrategy] || 'objection_combined')
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const newVersion = (lastVersion?.version || 0) + 1;

    const { data: generatedDoc, error: insertError } = await supabase
      .from('case_generated_documents')
      .insert({
        case_id: caseId,
        user_id: user.id,
        document_type: strategyToType[requestedStrategy] || 'objection_combined',
        version: newVersion,
        title: generationResult.title || 'Возражение на исковое заявление',
        content: generationResult.content,
        metadata: {
          legal_references: generationResult.legal_references || [],
          grounds: generationResult.grounds || [],
          attachments_checklist: generationResult.attachments_checklist || [],
          strategy_used: requestedStrategy,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error('Generated doc insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save generated document' }, { status: 500 });
    }

    await supabase
      .from('cases')
      .update({ status: 'completed' })
      .eq('id', caseId);

    let notifyMessage = `**Возражение на иск подготовлено** (версия ${newVersion})\n\n`;
    notifyMessage += `Стратегия: ${requestedStrategy === 'facts' ? 'по фактам' : requestedStrategy === 'law' ? 'по праву' : requestedStrategy === 'procedural' ? 'процессуальная' : 'комбинированная'}\n\n`;

    if (generationResult.warnings?.length > 0) {
      notifyMessage += '**Обратите внимание:**\n';
      for (const w of generationResult.warnings) {
        notifyMessage += `⚠️ ${w}\n`;
      }
      notifyMessage += '\n';
    }

    if (generationResult.attachments_checklist?.length > 0) {
      notifyMessage += '**Чек-лист приложений:**\n';
      for (const a of generationResult.attachments_checklist) {
        notifyMessage += `☐ ${a}\n`;
      }
    }

    await supabase.from('case_messages').insert({
      case_id: caseId,
      user_id: user.id,
      role: 'assistant',
      content: notifyMessage,
      message_type: 'document_generated',
    });

    return NextResponse.json({
      document: generatedDoc,
      quality_gates: qualityGates,
    }, { status: 201 });
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
