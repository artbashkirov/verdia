'use client';

import {
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Shield,
  Zap,
  FileText,
} from 'lucide-react';
import type { Case } from '@/types/database';

interface CaseAnalysisPanelProps {
  caseData: Case;
  onAnalyze: () => void;
  onGenerate: () => void;
  isAnalyzing: boolean;
  isGenerating: boolean;
  hasDocuments: boolean;
}

export function CaseAnalysisPanel({
  caseData,
  onAnalyze,
  onGenerate,
  isAnalyzing,
  isGenerating,
  hasDocuments,
}: CaseAnalysisPanelProps) {
  const analysis = caseData.analysis;
  const entities = caseData.entities;
  const missingInfo = caseData.missing_info || [];
  const probability = caseData.probability;
  const hasAnalysis = analysis && (analysis.summary || analysis.qualification);

  return (
    <div className="flex flex-col gap-6 max-w-[720px] mx-auto">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-medium text-foreground">Анализ дела</h2>
        <div className="flex items-center gap-2">
          {hasDocuments && caseData.status !== 'completed' && (
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {hasAnalysis ? 'Обновить анализ' : 'Запустить анализ'}
            </button>
          )}
          {(caseData.status === 'ready' || caseData.status === 'needs_info') && (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium bg-green-50 text-green-600 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Сгенерировать возражение
            </button>
          )}
        </div>
      </div>

      {!hasAnalysis && !hasDocuments && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Info className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-500">Загрузите документы для начала анализа</p>
          <p className="text-[13px] text-gray-400 mt-1">
            AI проанализирует загруженные документы и предоставит рекомендации
          </p>
        </div>
      )}

      {!hasAnalysis && hasDocuments && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-500">Документы загружены</p>
          <p className="text-[13px] text-gray-400 mt-1">
            Запустите анализ, чтобы AI изучил дело
          </p>
        </div>
      )}

      {hasAnalysis && (
        <>
          {/* Summary */}
          {analysis.summary && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-[14px] font-medium text-foreground mb-2">Общая оценка</h3>
              <p className="text-[14px] text-gray-600 leading-[20px]">{analysis.summary}</p>
              {analysis.qualification && (
                <p className="text-[13px] text-gray-500 mt-2">
                  Квалификация: {analysis.qualification}
                </p>
              )}
            </div>
          )}

          {/* Probability */}
          {probability && probability.percentage !== undefined && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-[14px] font-medium text-foreground mb-2">
                Вероятность успеха
              </h3>
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12">
                  <svg viewBox="0 0 36 36" className="w-12 h-12">
                    <path
                      d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={probability.percentage >= 60 ? '#22c55e' : probability.percentage >= 40 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="3"
                      strokeDasharray={`${probability.percentage}, 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium">
                    {probability.percentage}%
                  </span>
                </div>
                <div>
                  <p className="text-[14px] font-medium text-foreground">
                    {probability.level || (probability.percentage >= 60 ? 'Хорошие шансы' : 'Требует внимания')}
                  </p>
                </div>
              </div>
              {probability.positive_factors && probability.positive_factors.length > 0 && (
                <div className="mt-3">
                  <p className="text-[13px] font-medium text-green-600 mb-1">Положительные факторы:</p>
                  <ul className="flex flex-col gap-1">
                    {probability.positive_factors.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[13px] text-gray-600">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {probability.negative_factors && probability.negative_factors.length > 0 && (
                <div className="mt-3">
                  <p className="text-[13px] font-medium text-red-600 mb-1">Отрицательные факторы:</p>
                  <ul className="flex flex-col gap-1">
                    {probability.negative_factors.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[13px] text-gray-600">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Entities */}
          {entities && (entities.plaintiff?.name || entities.defendant?.name || entities.court?.name) && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-[14px] font-medium text-foreground mb-3">Стороны дела</h3>
              <div className="flex flex-col gap-3">
                {entities.plaintiff?.name && (
                  <div>
                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">Истец</span>
                    <p className="text-[14px] text-foreground mt-0.5">{entities.plaintiff.name}</p>
                  </div>
                )}
                {entities.defendant?.name && (
                  <div>
                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">Ответчик</span>
                    <p className="text-[14px] text-foreground mt-0.5">{entities.defendant.name}</p>
                  </div>
                )}
                {entities.court?.name && (
                  <div>
                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">Суд</span>
                    <p className="text-[14px] text-foreground mt-0.5">{entities.court.name}</p>
                    {entities.court.case_number && (
                      <p className="text-[13px] text-gray-500 mt-0.5">Дело № {entities.court.case_number}</p>
                    )}
                  </div>
                )}
                {entities.subject && (
                  <div>
                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">Предмет</span>
                    <p className="text-[14px] text-foreground mt-0.5">{entities.subject}</p>
                  </div>
                )}
                {entities.claim_amount !== undefined && entities.claim_amount > 0 && (
                  <div>
                    <span className="text-[12px] font-medium text-gray-400 uppercase tracking-wide">Сумма иска</span>
                    <p className="text-[14px] text-foreground mt-0.5">
                      {entities.claim_amount.toLocaleString('ru-RU')} ₽
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Strategy */}
          {analysis.recommended_strategy && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-[14px] font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                Рекомендуемая стратегия
              </h3>
              <p className="text-[14px] text-gray-600">
                {analysis.recommended_strategy === 'facts' && 'Возражение по фактическим обстоятельствам'}
                {analysis.recommended_strategy === 'law' && 'Возражение по правовым основаниям'}
                {analysis.recommended_strategy === 'procedural' && 'Процессуальные возражения'}
                {analysis.recommended_strategy === 'combined' && 'Комбинированная стратегия'}
              </p>
              {analysis.strengths && analysis.strengths.length > 0 && (
                <div className="mt-2">
                  <p className="text-[13px] font-medium text-green-600 mb-1">Сильные стороны:</p>
                  <ul className="flex flex-col gap-1">
                    {analysis.strengths.map((s, i) => (
                      <li key={i} className="text-[13px] text-gray-600 flex items-start gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                <div className="mt-2">
                  <p className="text-[13px] font-medium text-orange-600 mb-1">Слабые стороны:</p>
                  <ul className="flex flex-col gap-1">
                    {analysis.weaknesses.map((w, i) => (
                      <li key={i} className="text-[13px] text-gray-600 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Missing Info */}
          {missingInfo.length > 0 && (
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
              <h3 className="text-[14px] font-medium text-orange-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Недостающая информация
              </h3>
              <ul className="flex flex-col gap-2">
                {missingInfo.map((info, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                        info.priority === 'high'
                          ? 'bg-red-500'
                          : info.priority === 'medium'
                          ? 'bg-orange-500'
                          : 'bg-yellow-500'
                      }`}
                    />
                    <div>
                      <p className="text-[13px] font-medium text-foreground">{info.field}</p>
                      <p className="text-[13px] text-gray-600">{info.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Legal Basis */}
          {analysis.legal_basis && analysis.legal_basis.length > 0 && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-[14px] font-medium text-foreground mb-2">Правовые основания</h3>
              <ul className="flex flex-col gap-1.5">
                {analysis.legal_basis.map((basis, i) => (
                  <li key={i} className="text-[13px] text-gray-600 flex items-start gap-1.5">
                    <span className="text-gray-400 shrink-0">§</span>
                    {basis}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
