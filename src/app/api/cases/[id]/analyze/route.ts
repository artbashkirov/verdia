import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { callAI } from '@/lib/openai';
import { getLawContext } from '@/lib/rag';
import {
  CASE_ANALYSIS_PROMPT,
  DOCUMENT_ANALYSIS_PROMPT,
  buildCaseAnalysisContext,
} from '@/lib/case-prompts';
import { checkQualityGates } from '@/lib/quality-gates';
import type { CaseAnalysis, CaseEntities, CaseMissingInfo } from '@/types/database';

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

    await supabase
      .from('cases')
      .update({ status: 'analyzing' })
      .eq('id', caseId);

    const { data: documents } = await supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    const { data: messages } = await supabase
      .from('case_messages')
      .select('role, content')
      .eq('case_id', caseId)
      .eq('message_type', 'message')
      .order('created_at', { ascending: true });

    const body = await request.json().catch(() => ({}));
    const analyzeNewDocId = body.document_id;

    if (analyzeNewDocId && documents) {
      const newDoc = documents.find(d => d.id === analyzeNewDocId);
      if (newDoc && newDoc.extracted_text && (!newDoc.analysis || Object.keys(newDoc.analysis).length === 0)) {
        try {
          const docAnalysisContext = `Контекст дела: ${caseData.description || 'Не указано'}\n\nТекст документа:\n${newDoc.extracted_text.substring(0, 5000)}`;
          const docAnalysisRaw = await callAI(docAnalysisContext, DOCUMENT_ANALYSIS_PROMPT, 2000);
          const docAnalysis = JSON.parse(docAnalysisRaw);

          await supabase
            .from('case_documents')
            .update({
              analysis: docAnalysis,
              is_relevant: docAnalysis.is_relevant ?? true,
            })
            .eq('id', analyzeNewDocId);
        } catch (e) {
          console.error('Document analysis error:', e);
        }
      }
    }

    const docsForContext = (documents || [])
      .filter(d => d.extracted_text)
      .map(d => ({
        file_name: d.file_name,
        extracted_text: d.extracted_text!,
        analysis: d.analysis,
      }));

    const chatHistory = (messages || []).map(m => ({
      role: m.role,
      content: m.content,
    }));

    let lawContext = '';
    try {
      const searchQuery = caseData.description || docsForContext.map(d => d.file_name).join(' ');
      lawContext = await getLawContext(searchQuery, { matchCount: 5, matchThreshold: 0.3 });
    } catch {
      console.warn('RAG not available for case analysis');
    }

    const context = buildCaseAnalysisContext({
      caseDescription: caseData.description || undefined,
      documents: docsForContext,
      chatHistory,
      caseType: caseData.case_type,
      lawContext: lawContext || undefined,
    });

    let analysisResult;
    try {
      const rawResponse = await callAI(context, CASE_ANALYSIS_PROMPT, 4000);
      analysisResult = JSON.parse(rawResponse);
    } catch (e) {
      console.error('Case analysis AI error:', e);
      await supabase
        .from('cases')
        .update({ status: 'draft' })
        .eq('id', caseId);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const analysis: CaseAnalysis = {
      qualification: analysisResult.qualification,
      risks: analysisResult.risks || [],
      strengths: analysisResult.strengths || [],
      weaknesses: analysisResult.weaknesses || [],
      recommended_strategy: analysisResult.recommended_strategy,
      summary: analysisResult.summary,
      legal_basis: analysisResult.legal_basis || [],
    };

    const entities: CaseEntities = analysisResult.entities || {};
    const missingInfo: CaseMissingInfo[] = analysisResult.missing_info || [];

    const qualityGates = checkQualityGates({
      analysis,
      entities,
      missingInfo,
      documentsCount: docsForContext.length,
      extractedTextsAvailable: docsForContext.some(d => d.extracted_text.length > 0),
    });

    const newStatus = analysisResult.ready_to_generate && qualityGates.passed
      ? 'ready'
      : missingInfo.length > 0 || !qualityGates.passed
        ? 'needs_info'
        : 'ready';

    await supabase
      .from('cases')
      .update({
        status: newStatus,
        stage: analysisResult.stage || null,
        strategy: analysisResult.recommended_strategy || null,
        analysis,
        entities,
        missing_info: missingInfo,
        probability: {
          level: analysisResult.ready_to_generate ? 'analyzed' : 'insufficient_data',
        },
      })
      .eq('id', caseId);

    let summaryMessage = `**Анализ дела завершен**\n\n${analysis.summary || 'Анализ проведен.'}`;

    if (missingInfo.length > 0) {
      summaryMessage += '\n\n**Не хватает данных:**\n';
      for (const info of missingInfo) {
        const priority = info.priority === 'high' ? '❗' : info.priority === 'medium' ? '⚠️' : 'ℹ️';
        summaryMessage += `${priority} ${info.description}\n`;
      }
    }

    if (!qualityGates.passed) {
      summaryMessage += '\n\n**Предупреждения quality gates:**\n';
      for (const failure of qualityGates.critical_failures) {
        summaryMessage += `❗ ${failure}\n`;
      }
    }

    if (analysisResult.clarification_questions?.length > 0) {
      summaryMessage += '\n\n**Уточняющие вопросы:**\n';
      for (const q of analysisResult.clarification_questions) {
        summaryMessage += `• ${q}\n`;
      }
    }

    if (newStatus === 'ready') {
      summaryMessage += '\n\n✅ Достаточно данных для подготовки возражения. Хотите сгенерировать документ?';
    }

    await supabase.from('case_messages').insert({
      case_id: caseId,
      user_id: user.id,
      role: 'assistant',
      content: summaryMessage,
      message_type: 'analysis',
    });

    return NextResponse.json({
      analysis,
      entities,
      missing_info: missingInfo,
      quality_gates: qualityGates,
      status: newStatus,
      clarification_questions: analysisResult.clarification_questions || [],
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
