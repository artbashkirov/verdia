'use client';

import { useState } from 'react';

// Helper function to get probability label based on percentage
function getProbabilityLabel(percentage: number): string {
  if (percentage === 0) return 'недостаточно данных';
  if (percentage >= 95) return 'максимальная';
  if (percentage >= 80) return 'очень высокая';
  if (percentage >= 65) return 'высокая';
  if (percentage >= 51) return 'выше средней';
  if (percentage >= 35) return 'средняя';
  if (percentage >= 20) return 'ниже средней';
  return 'низкая';
}

interface ProbabilityData {
  percentage?: number;
  totalCases?: number;
  casesWithResult?: number;
  satisfied?: number;
  partial?: number;
  rejected?: number;
  unknown?: number;
}

interface ProbabilityBlockProps {
  probData: ProbabilityData | null | undefined;
  resolvedTheme: string;
}

// Probability block component with expand/collapse
export function ProbabilityBlock({ probData, resolvedTheme }: ProbabilityBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const totalCases = probData?.totalCases || 0;
  // Если поля не переданы, считаем их 0 (не undefined)
  const satisfied = probData?.satisfied ?? 0;
  const partial = probData?.partial ?? 0;
  const rejected = probData?.rejected ?? 0;
  const unknown = probData?.unknown ?? 0;
  
  // Вычисляем casesWithResult: либо из поля, либо из суммы (но только если поля определены)
  const casesWithResult = probData?.casesWithResult !== undefined 
    ? probData.casesWithResult 
    : (probData?.satisfied !== undefined || probData?.partial !== undefined || probData?.rejected !== undefined)
      ? (satisfied + partial + rejected)
      : 0;
  
  const hasFullStats = totalCases > 0 && (
    probData?.satisfied !== undefined || 
    probData?.partial !== undefined || 
    probData?.rejected !== undefined || 
    probData?.unknown !== undefined
  );
  
  // Если все результаты неизвестны, нельзя рассчитывать вероятность
  const percentage = casesWithResult > 0 ? (probData?.percentage ?? 0) : 0;
  const hasValidPercentage = casesWithResult > 0 && percentage > 0;
  const level = hasValidPercentage ? getProbabilityLabel(percentage) : null;

  if (!hasValidPercentage || casesWithResult === 0) {
    return (
      <div className="mt-4 p-4 rounded-xl relative" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
        <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] mb-3">
          Вероятность выиграть дело
        </p>
        <p className="text-[16px] lg:text-[18px] font-medium text-gray-500">
          {casesWithResult === 0 && totalCases > 0 
            ? 'Не удалось рассчитать вероятность: все найденные дела имеют неизвестный результат'
            : 'Недостаточно данных для расчёта вероятности'}
        </p>
        {/* Info icon with tooltip - always in top right */}
        <div className="probability-tooltip-container absolute right-6 top-4 group">
          <button
            className="w-4 h-4 rounded-full border border-gray-400 text-gray-400 flex items-center justify-center text-[10px] font-medium hover:border-gray-500 hover:text-gray-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const tooltip = e.currentTarget.nextElementSibling;
              if (tooltip) {
                tooltip.classList.toggle('hidden');
                tooltip.classList.toggle('block');
              }
            }}
          >
            i
          </button>
          <div className="probability-tooltip hidden lg:group-hover:block absolute right-0 bottom-full mb-2 w-72 p-3 bg-white rounded-lg shadow-lg border border-gray-200 text-sm text-gray-600 z-50">
            <p className="font-medium text-gray-900 mb-1">Как рассчитывается вероятность?</p>
            <p className="mb-2">Оценка основана на анализе похожих судебных дел: соотношении удовлетворённых и отклонённых исков, а также ключевых факторов вашей ситуации.</p>
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
              Для расчёта вероятности требуется хотя бы одно дело с известным результатом.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 rounded-xl relative" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] mb-3">
        Вероятность выиграть дело
      </p>
      
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-[24px] lg:text-[32px] font-bold text-foreground">
          {percentage}%
          <span className="text-[16px] lg:text-[18px] font-medium text-gray-500 ml-2">
            ({level})
          </span>
        </p>
        {hasFullStats && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[13px] lg:text-[14px] font-normal text-gray-500 underline hover:text-gray-700 transition-colors"
            style={{ marginTop: '0' }}
          >
            {isExpanded ? 'Свернуть' : 'Подробнее'}
          </button>
        )}
      </div>

      {isExpanded && hasFullStats && (
        <div className="mt-3">
          <p className="text-[13px] lg:text-[14px] font-normal text-gray-600 mb-3">
            На основе аналогичных {totalCases} дел из которых:
          </p>
          <ul className="space-y-1.5 text-[13px] lg:text-[14px] font-normal text-gray-700">
            {satisfied > 0 && <li>• Удовлетворено: {satisfied}</li>}
            {partial > 0 && <li>• Частично удовлетворено: {partial}</li>}
            {rejected > 0 && <li>• Отказано: {rejected}</li>}
            {unknown > 0 && <li>• Неизвестно: {unknown}</li>}
          </ul>
        </div>
      )}

      {!hasFullStats && totalCases > 0 && (
        <p className="text-[12px] lg:text-[14px] font-normal text-gray-500 mt-2">
          на основе {casesWithResult || totalCases} из {totalCases} дел
        </p>
      )}

      {/* Info icon with tooltip - always in top right */}
      <div className="probability-tooltip-container absolute right-6 top-4 group">
        <button
          className="w-4 h-4 rounded-full border border-gray-400 text-gray-400 flex items-center justify-center text-[10px] font-medium hover:border-gray-500 hover:text-gray-500 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            const tooltip = e.currentTarget.nextElementSibling;
            if (tooltip) {
              tooltip.classList.toggle('hidden');
              tooltip.classList.toggle('block');
            }
          }}
        >
          i
        </button>
        <div className="probability-tooltip hidden lg:group-hover:block absolute right-0 bottom-full mb-2 w-72 p-3 bg-white rounded-lg shadow-lg border border-gray-200 text-sm text-gray-600 z-50">
          <p className="font-medium text-gray-900 mb-1">Как рассчитывается вероятность?</p>
          <p className="mb-2">Оценка основана на анализе похожих судебных дел: соотношении удовлетворённых и отклонённых исков, а также ключевых факторов вашей ситуации.</p>
          {hasFullStats && (
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
              Расчёт основан на {casesWithResult} из {totalCases} найденных дел с известным результатом.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
