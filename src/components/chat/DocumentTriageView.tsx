'use client';

import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Результат первичного анализа документов (triage). Бэкенд кладёт его в
 * generations.response с маркером `_mode: 'document-triage'`. На основании
 * этого UI рисует другой layout — без секций «правовой анализ» / «анализ
 * практики» / «вероятность», потому что без выбранного действия они общи
 * и бесполезны (а ещё медленны для генерации).
 *
 * Кнопки «suggestedActions» при клике вызывают /api/document-action и
 * запускают полноценный анализ под конкретное действие.
 */
export interface DocumentTriageData {
  caseTitle: string;
  summary: string;
  documentBreakdown: Array<{
    fileName: string;
    type: string;
    summary: string;
  }>;
  documentType: string;
  suggestedActions: Array<{
    id: string;
    label: string;
    description: string;
    needsCases: boolean;
    needsLaw: boolean;
    actionPrompt: string;
  }>;
  missingInfo: string[];
  userQuestions: string[];
  _mode?: 'document-triage';
}

interface Props {
  triage: DocumentTriageData;
  chatId: string;
  /**
   * Когда пользователь жмёт на действие, мы делаем POST в /api/document-action.
   * Родитель может передать кастомный обработчик (например, чтобы выгрузить
   * новое assistant-сообщение в локальный state до серверного ответа).
   * По умолчанию используется fetch напрямую.
   */
  onActionStart?: (action: {
    id: string;
    label: string;
    actionPrompt: string;
  }) => Promise<void> | void;
  /**
   * Колбэк после успешного завершения действия — обычно для рефреша
   * списка сообщений или редиректа.
   */
  onActionComplete?: () => void;
  /**
   * Сообщения чата ниже triage-блока могут быть в progress. Если родитель
   * блокирует UI глобально, передавайте здесь — кнопки будут disabled.
   */
  isBusy?: boolean;
}

const SECTION_LABEL_CLASS =
  'text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]';

const DIVIDER = 'h-px bg-gray-200';

export function DocumentTriageView({
  triage,
  chatId,
  onActionStart,
  onActionComplete,
  isBusy = false,
}: Props) {
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const hasBreakdown = triage.documentBreakdown.length > 0;
  const hasMissingInfo = triage.missingInfo.length > 0;
  const hasQuestions = triage.userQuestions.length > 0;
  const hasActions = triage.suggestedActions.length > 0;

  const handleActionClick = async (action: DocumentTriageData['suggestedActions'][number]) => {
    if (pendingActionId || isBusy) return;
    if (!chatId) {
      toast.error('Чат ещё не создан. Подождите окончания анализа.');
      return;
    }

    setPendingActionId(action.id);
    try {
      // Делегируем родителю — он может добавить сообщение в чат и т.п.
      if (onActionStart) {
        await onActionStart({
          id: action.id,
          label: action.label,
          actionPrompt: action.actionPrompt,
        });
      } else {
        // Базовый сценарий: POST на API, без оптимистичных сообщений.
        const res = await fetch('/api/document-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationId: chatId,
            actionId: action.id,
            label: action.label,
            actionPrompt: action.actionPrompt,
          }),
        });
        if (!res.ok) {
          let msg = 'Не удалось выполнить действие';
          try {
            const json = await res.json();
            if (json?.error) msg = json.error;
          } catch {
            // ignore parse error — оставляем дефолтный текст
          }
          throw new Error(msg);
        }
      }
      onActionComplete?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Произошла ошибка';
      console.error('[DocumentTriageView] action failed:', err);
      toast.error(msg);
    } finally {
      setPendingActionId(null);
    }
  };

  return (
    <>
      {/* Краткий анализ */}
      <div className="flex flex-col gap-4">
        <p className={SECTION_LABEL_CLASS}>Анализ документов</p>
        <div className="text-base text-foreground leading-[24px] break-words">
          {triage.summary && (
            <p className="break-words whitespace-pre-line">{triage.summary}</p>
          )}
        </div>
      </div>

      {/* Разбор по документам */}
      {hasBreakdown && (
        <>
          <div className={DIVIDER} />
          <div className="flex flex-col gap-4">
            <p className={SECTION_LABEL_CLASS}>Что прислано</p>
            <div className="flex flex-col gap-3">
              {triage.documentBreakdown.map((doc, idx) => (
                <div
                  key={`${doc.fileName}-${idx}`}
                  className="p-4 rounded-xl bg-[#F3F3F3] flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <p className="text-[15px] font-semibold text-[#212121] break-words">
                      {doc.type || 'Документ'}
                    </p>
                    <p className="text-[12px] text-gray-500 break-all" title={doc.fileName}>
                      {doc.fileName}
                    </p>
                  </div>
                  {doc.summary && (
                    <p className="text-[14px] text-[#212121] leading-[20px] break-words whitespace-pre-line">
                      {doc.summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Чего не хватает */}
      {hasMissingInfo && (
        <>
          <div className={DIVIDER} />
          <div className="flex flex-col gap-4">
            <p className={SECTION_LABEL_CLASS}>Чего не хватает для полного анализа</p>
            <ul className="list-disc ml-5 text-base text-foreground leading-[24px] break-words">
              {triage.missingInfo.map((item, i) => (
                <li key={i} className="mb-2 last:mb-0 break-words">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Уточняющие вопросы */}
      {hasQuestions && (
        <>
          <div className={DIVIDER} />
          <div className="flex flex-col gap-4">
            <p className={SECTION_LABEL_CLASS}>Уточнения, чтобы помочь точнее</p>
            <ul className="list-disc ml-5 text-base text-foreground leading-[24px] break-words">
              {triage.userQuestions.map((item, i) => (
                <li key={i} className="mb-2 last:mb-0 break-words">
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-500">
              Ответьте на эти вопросы в чате ниже — я учту их при подготовке.
            </p>
          </div>
        </>
      )}

      {/* Кнопки следующих действий */}
      {hasActions && (
        <>
          <div className={DIVIDER} />
          <div className="flex flex-col gap-4">
            <p className={SECTION_LABEL_CLASS}>Что дальше?</p>
            <div className="p-4 rounded-xl bg-[#F3F3F3]">
              <p className="text-base text-[#212121] mb-2">
                <strong>Выберите, чем я могу помочь по этому делу:</strong>
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Я начну глубокий анализ только после вашего выбора — иначе
                это будут общие слова. Если ни один вариант не подходит,
                просто напишите в чат ниже.
              </p>
              <div className="flex flex-col gap-2">
                {triage.suggestedActions.map((action) => {
                  const isPending = pendingActionId === action.id;
                  const disabled = !!pendingActionId || isBusy;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleActionClick(action)}
                      disabled={disabled}
                      className="w-full text-left px-4 py-3 rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col gap-1"
                    >
                      <span className="text-sm font-medium flex items-center gap-2">
                        {isPending && (
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        )}
                        {action.label}
                      </span>
                      {action.description && (
                        <span className="text-xs text-gray-300 leading-[16px]">
                          {action.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default DocumentTriageView;
