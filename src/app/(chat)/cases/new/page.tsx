'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar, MobileHeader, MobileSidebar } from '@/components/layout';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

type CaseType = 'objection';
type Stage = 'pre_court' | 'after_filing' | 'after_acceptance' | 'appeal' | 'cassation';

const STAGES: { value: Stage; label: string; description: string }[] = [
  { value: 'pre_court', label: 'Досудебная стадия', description: 'Иск ещё не подан, подготовка к защите' },
  { value: 'after_filing', label: 'После подачи иска', description: 'Иск подан, но не принят судом' },
  { value: 'after_acceptance', label: 'После принятия к производству', description: 'Суд принял иск к рассмотрению' },
  { value: 'appeal', label: 'Апелляция', description: 'Обжалование решения суда первой инстанции' },
  { value: 'cassation', label: 'Кассация', description: 'Обжалование вступившего в силу решения' },
];

export default function NewCasePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [caseType] = useState<CaseType>('objection');
  const [stage, setStage] = useState<Stage | ''>('');
  const [isCreating, setIsCreating] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          case_type: caseType,
          stage: stage || undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/cases/${data.case.id}`);
      } else {
        const err = await response.json();
        toast.error(err.error || 'Ошибка при создании дела');
      }
    } catch (error) {
      console.error('Error creating case:', error);
      toast.error('Ошибка при создании дела');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex bg-background h-screen mobile-fixed-layout" style={{ width: '100%' }}>
      <MobileHeader
        onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMenuOpen={isMobileMenuOpen}
        onNewChat={() => router.push('/chat')}
      />
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onNewChat={() => router.push('/chat')}
      />
      <Sidebar onNewChat={() => router.push('/chat')} className="hidden md:flex" />

      <div className="flex-1 flex flex-col min-w-0 p-0 md:p-2 md:pl-0 md:pb-0 pt-[56px] md:pt-2 bg-[#17181A]" style={{ overflow: 'hidden', minHeight: 0 }}>
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background md:rounded-2xl relative flex flex-col" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          <div className="flex flex-col px-4 md:px-8 pt-6 md:pt-10 pb-8 w-full max-w-[640px] mx-auto">
            <Link
              href="/cases"
              className="flex items-center gap-1.5 text-[14px] text-gray-500 hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Назад к делам</span>
            </Link>

            <h1 className="text-[20px] lg:text-[28px] font-normal text-foreground leading-[28px] lg:leading-[36px]">
              Новое дело
            </h1>
            <p className="text-[14px] text-gray-500 leading-[20px] mt-1">
              Опишите суть дела и загрузите документы
            </p>

            <div className="flex flex-col gap-5 mt-8">
              <div className="flex flex-col gap-1.5">
                <label className="text-[14px] font-medium text-foreground">
                  Название дела <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Возражение на иск ООО «Ромашка»"
                  className="h-12 px-4 rounded-xl border border-gray-200 text-[16px] text-foreground placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors bg-transparent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[14px] font-medium text-foreground">
                  Описание
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Кратко опишите суть дела, основные обстоятельства..."
                  rows={4}
                  className="px-4 py-3 rounded-xl border border-gray-200 text-[16px] text-foreground placeholder:text-gray-400 outline-none focus:border-gray-400 transition-colors bg-transparent resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[14px] font-medium text-foreground">
                  Стадия дела
                </label>
                <div className="flex flex-col gap-2">
                  {STAGES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setStage(s.value)}
                      className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                        stage === s.value
                          ? 'border-foreground bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-[14px] font-medium text-foreground">{s.label}</span>
                      <span className="text-[13px] text-gray-500 mt-0.5">{s.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={handleCreate}
                disabled={!title.trim() || isCreating}
                className="flex items-center justify-center gap-2 h-12 px-6 bg-foreground text-background rounded-xl hover:opacity-80 transition-opacity text-[16px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                Создать дело
              </button>
              <Link
                href="/cases"
                className="flex items-center justify-center h-12 px-6 border border-gray-200 text-foreground rounded-xl hover:bg-gray-50 transition-colors text-[16px] font-medium"
              >
                Отмена
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
