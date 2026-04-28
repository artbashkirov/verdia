'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FolderOpen, Loader2, X } from 'lucide-react';

interface CaseTransitionBannerProps {
  generationId: string;
  query: string;
}

export function CaseTransitionBanner({ generationId, query }: CaseTransitionBannerProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  const handleCreateCase = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/cases/from-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId,
          title: query.slice(0, 100),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/cases/${data.case.id}`);
      } else {
        toast.error('Ошибка при создании дела');
      }
    } catch (error) {
      console.error('Error creating case:', error);
      toast.error('Ошибка при создании дела');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="relative p-4 rounded-xl border border-blue-200 bg-blue-50">
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
          <FolderOpen className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-foreground">
            Открыть дело?
          </p>
          <p className="text-[13px] text-gray-600 mt-0.5">
            Загрузите документы, и AI проведёт полный анализ с проверкой quality gates
          </p>
          <button
            onClick={handleCreateCase}
            disabled={isCreating}
            className="flex items-center gap-1.5 mt-3 h-8 px-3 text-[13px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isCreating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5" />
            )}
            Создать дело
          </button>
        </div>
      </div>
    </div>
  );
}
