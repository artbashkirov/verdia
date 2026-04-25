import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseDocument,
  isSupportedMimeType,
  validateFileSize,
  getDocumentType,
} from '@/lib/document-parser';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: documents, error } = await supabase
      .from('case_documents')
      .select('*')
      .eq('case_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching documents:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (error) {
    console.error('Documents GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
      .select('id')
      .eq('id', caseId)
      .eq('user_id', user.id)
      .single();

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!isSupportedMimeType(file.type)) {
      return NextResponse.json(
        { error: `Формат файла не поддерживается: ${file.type}. Поддерживаются: PDF, DOCX, JPG, PNG, TXT` },
        { status: 400 }
      );
    }

    if (!validateFileSize(file.size)) {
      return NextResponse.json(
        { error: 'Файл слишком большой. Максимальный размер: 20 МБ' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = getDocumentType(file.type);
    const storagePath = `${user.id}/${caseId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('case-documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    let extractedText = '';
    try {
      const parsed = await parseDocument(buffer, file.type, file.name);
      extractedText = parsed.text;
    } catch (parseError) {
      console.error('Document parsing error:', parseError);
    }

    const { data: document, error: insertError } = await supabase
      .from('case_documents')
      .insert({
        case_id: caseId,
        user_id: user.id,
        file_name: file.name,
        file_type: fileType!,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        extracted_text: extractedText || null,
        is_relevant: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Document insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 });
    }

    await supabase.from('case_messages').insert({
      case_id: caseId,
      user_id: user.id,
      role: 'system',
      content: `Загружен документ: ${file.name}`,
      message_type: 'document_upload',
      attached_documents: [document.id],
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
