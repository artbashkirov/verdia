'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar, MobileHeader, MobileSidebar } from '@/components/layout';
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { Case } from '@/types/database';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  draft: { label: 'Черновик', icon: FileText, color: 'text-gray-400' },
  analyzing: { label: 'Анализ...', icon: Loader2, color: 'text-blue-500' },
  needs_info: { label: 'Нужны данные', icon: AlertCircle, color: 'text-orange-500' },
  ready: { label: 'Готово к генерации', icon: CheckCircle, color: 'text-green-500' },
  completed: { label: 'Завершено', icon: CheckCircle, color: 'text-green-600' },
};

export default function CasesPage() {
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const response = await fetch('/api/cases');
      if (response.ok) {
        const data = await response.json();
        setCases(data.cases || []);
      }
    } catch (error) {
      console.error('Error loading cases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
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
          <div className="flex flex-col px-4 md:px-8 pt-6 md:pt-10 pb-8 w-full max-w-[960px] mx-auto">
            <div className="flex items-center justify-between">
              <h1 className="text-[20px] lg:text-[32px] font-normal text-foreground leading-[28px] lg:leading-[40px]">
                Мои дела
              </h1>
              <Link
                href="/cases/new"
                className="flex items-center gap-2 h-10 px-4 bg-foreground text-background rounded-xl hover:opacity-80 transition-opacity text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Новое дело</span>
              </Link>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : cases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileText className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-[16px] text-gray-500 leading-[24px]">
                  У вас пока нет дел
                </p>
                <p className="text-[14px] text-gray-400 leading-[20px] mt-1">
                  Создайте первое дело, чтобы начать работу
                </p>
                <Link
                  href="/cases/new"
                  className="flex items-center gap-2 h-10 px-4 mt-4 bg-foreground text-background rounded-xl hover:opacity-80 transition-opacity text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>Создать дело</span>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-6">
                {cases.map((caseItem) => {
                  const statusConfig = STATUS_CONFIG[caseItem.status] || STATUS_CONFIG.draft;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <Link
                      key={caseItem.id}
                      href={`/cases/${caseItem.id}`}
                      className="flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[16px] font-medium text-foreground leading-[24px] truncate">
                            {caseItem.title}
                          </h3>
                        </div>
                        {caseItem.description && (
                          <p className="text-[14px] text-gray-500 leading-[20px] mt-1 line-clamp-2">
                            {caseItem.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`flex items-center gap-1 text-[13px] ${statusConfig.color}`}>
                            <StatusIcon className={`w-3.5 h-3.5 ${caseItem.status === 'analyzing' ? 'animate-spin' : ''}`} />
                            {statusConfig.label}
                          </span>
                          <span className="text-[13px] text-gray-400">
                            {formatDate(caseItem.updated_at)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
