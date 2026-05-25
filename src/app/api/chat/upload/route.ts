import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseDocument,
  resolveFileMimeType,
  validateFileSize,
} from '@/lib/document-parser';

/**
 * Загружает прикреплённый к чату документ, парсит его и возвращает
 * извлечённый текст. Файл нигде НЕ сохраняется — текст уходит в AI-промпт,
 * метаинформация (имя/размер) сохранится в самом сообщении пользователя.
 *
 * Сделано отдельным маршрутом (а не внутри `/api/chat`), чтобы:
 *  - не блокировать отправку сообщения долгим OCR/PDF-парсингом;
 *  - дать UI чёткое состояние «загружаю файл» с возможностью отмены;
 *  - переиспользовать тот же эндпоинт на главной /chat (для первого
 *    запроса до создания generation), не плодя form-encoded маршруты.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Необходима авторизация' },
        { status: 401 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      console.error('[chat/upload] formData parse error:', err);
      return NextResponse.json(
        { error: 'Неверный формат запроса' },
        { status: 400 },
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Файл не получен' },
        { status: 400 },
      );
    }

    const mimeType = resolveFileMimeType(file.name, file.type);
    if (!mimeType) {
      return NextResponse.json(
        {
          error: `Формат файла не поддерживается: ${file.type || 'неизвестный тип'}. Поддерживаются: PDF, DOCX, JPG, PNG, WEBP, TXT.`,
        },
        { status: 400 },
      );
    }

    if (!validateFileSize(file.size)) {
      return NextResponse.json(
        { error: 'Файл слишком большой. Максимальный размер: 20 МБ.' },
        { status: 400 },
      );
    }

    console.log('[chat/upload] received file', {
      name: file.name,
      type: file.type,
      resolvedMimeType: mimeType,
      sizeBytes: file.size,
    });

    let extractedText = '';
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      console.log('[chat/upload] calling parseDocument', {
        name: file.name,
        mimeType,
        bufferLen: buffer.length,
      });
      const parsed = await parseDocument(buffer, mimeType, file.name);
      extractedText = (parsed.text || '').trim();
      console.log('[chat/upload] parseDocument done', {
        name: file.name,
        extractedTextLen: extractedText.length,
        preview: extractedText.slice(0, 150),
      });
    } catch (err) {
      console.error('[chat/upload] parse failed:', {
        name: file.name,
        type: file.type,
        size: file.size,
        message: err instanceof Error ? err.message : String(err),
      });
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Не удалось обработать файл.';
      return NextResponse.json({ error: message }, { status: 422 });
    }

    if (!extractedText) {
      // Для изображений без текста всё равно прикрепляем (пользователь
      // увидит файл в чате), но в extractedText кладём не «пусто», а
      // явную метку для AI — чтобы triage не написал «в документе нет
      // текста», а попросил пользователя пере-сфотографировать.
      if (mimeType.startsWith('image/')) {
        extractedText =
          `[OCR-system: не удалось распознать текст на изображении «${file.name}». ` +
          `Скорее всего, фото нечёткое, под углом, плохо освещено или сжато. ` +
          `Попроси пользователя прислать более чёткую копию (без бликов, ` +
          `прямо сверху, в хорошем разрешении) или текстовый файл вместо фото.]`;
      }
    }

    if (!extractedText) {
      return NextResponse.json(
        {
          error:
            'Не удалось извлечь текст из файла. Попробуйте другой формат или загрузите более чёткое изображение.',
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      attachment: {
        fileName: file.name,
        mimeType,
        size: file.size,
        extractedText,
      },
    });
  } catch (err) {
    console.error('[chat/upload] unexpected error:', err);
    return NextResponse.json(
      { error: 'Произошла ошибка при загрузке файла' },
      { status: 500 },
    );
  }
}
