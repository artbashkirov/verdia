'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Sidebar, MobileHeader, MobileSidebar } from '@/components/layout';
import { CaseDocumentsList } from '@/components/cases/CaseDocumentsList';
import { CaseAnalysisPanel } from '@/components/cases/CaseAnalysisPanel';
import { CaseChatMessage } from '@/components/cases/CaseChatMessage';
import {
  ArrowLeft,
  Loader2,
  SendHorizontal,
  Paperclip,
  FileText,
  MessageCircle,
  BarChart3,
  Trash2,
} from 'lucide-react';
import type { Case, CaseMessage, CaseDocument as CaseDocType } from '@/types/database';

type Tab = 'chat' | 'documents' | 'analysis';

export default function CaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [documents, setDocuments] = useState<CaseDocType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    loadCase();
    loadMessages();
    loadDocuments();
  }, [caseId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadCase = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}`);
      if (response.ok) {
        const data = await response.json();
        setCaseData(data.case);
      } else if (response.status === 404) {
        router.push('/cases');
      }
    } catch (error) {
      console.error('Error loading case:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/chat`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await fetch(`/api/cases/${caseId}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isSending) return;
    const text = message.trim();
    setMessage('');
    setIsSending(true);

    const optimisticMsg: CaseMessage = {
      id: `temp-${Date.now()}`,
      case_id: caseId,
      user_id: '',
      role: 'user',
      content: text,
      message_type: 'message',
      attached_documents: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const response = await fetch(`/api/cases/${caseId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (response.ok) {
        await loadMessages();
        await loadCase();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`/api/cases/${caseId}/documents`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json();
          console.error('Upload error:', err.error);
        }
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    }

    await loadDocuments();
    await loadMessages();
    await loadCase();
    setIsUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/documents/${docId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  const handleAnalyze = async () => {
    setIsSending(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/analyze`, {
        method: 'POST',
      });
      if (response.ok) {
        await loadCase();
        await loadMessages();
      }
    } catch (error) {
      console.error('Error analyzing case:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_type: 'objection_combined' }),
      });
      if (response.ok) {
        await loadCase();
        await loadMessages();
      } else {
        const err = await response.json();
        toast.error(err.error || 'Ошибка при генерации');
      }
    } catch (error) {
      console.error('Error generating document:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteCase = async () => {
    if (!confirm('Удалить дело? Это действие нельзя отменить.')) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/cases/${caseId}`, { method: 'DELETE' });
      if (response.ok) {
        router.push('/cases');
      }
    } catch (error) {
      console.error('Error deleting case:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const TABS: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
    { id: 'chat', label: 'Чат', icon: MessageCircle },
    { id: 'documents', label: 'Документы', icon: FileText },
    { id: 'analysis', label: 'Анализ', icon: BarChart3 },
  ];

  if (isLoading) {
    return (
      <div className="flex bg-background h-screen items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex bg-background h-screen items-center justify-center">
        <p className="text-gray-500">Дело не найдено</p>
      </div>
    );
  }

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

      <div
        className="flex-1 flex flex-col min-w-0 p-0 md:p-2 md:pl-0 md:pb-0 pt-[56px] md:pt-2 bg-[#17181A]"
        style={{ overflow: 'hidden', minHeight: 0 }}
      >
        <div
          className="flex-1 overflow-hidden bg-background md:rounded-2xl relative flex flex-col"
          style={{ minHeight: 0 }}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/cases"
                className="text-gray-400 hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-[16px] font-medium text-foreground truncate">
                  {caseData.title}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDeleteCase}
                disabled={isDeleting}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Удалить дело"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 flex border-b border-gray-100 px-4 md:px-6">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[14px] font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === 'documents' && documents.length > 0 && (
                    <span className="ml-1 text-[12px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {documents.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageCircle className="w-10 h-10 text-gray-300 mb-3" />
                      <p className="text-[16px] text-gray-500">
                        Загрузите документы и задайте вопрос
                      </p>
                      <p className="text-[14px] text-gray-400 mt-1">
                        AI проанализирует ваше дело и поможет подготовить возражение
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 max-w-[720px] mx-auto">
                      {messages.map((msg) => (
                        <CaseChatMessage key={msg.id} message={msg} />
                      ))}
                      {isSending && (
                        <div className="flex items-center gap-2 text-gray-400 text-[14px]">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Анализирую...
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {caseData.status !== 'completed' && (
                  <div className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-2 border-t border-gray-100">
                    <button
                      onClick={handleAnalyze}
                      disabled={isSending || documents.length === 0}
                      className="text-[13px] font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      Запустить анализ
                    </button>
                    {(caseData.status === 'ready' || caseData.status === 'needs_info') && (
                      <>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={handleGenerate}
                          disabled={isGenerating}
                          className="text-[13px] font-medium text-green-600 hover:text-green-700 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                        >
                          {isGenerating && <Loader2 className="w-3 h-3 animate-spin" />}
                          Сгенерировать возражение
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Input */}
                <div className="shrink-0 px-4 md:px-6 pb-4 pt-2">
                  <div
                    className="flex items-center w-full max-w-[720px] mx-auto overflow-hidden"
                    style={{
                      height: '56px',
                      borderRadius: '20px',
                      paddingLeft: '12px',
                      paddingRight: '12px',
                      gap: '8px',
                      backgroundColor: 'var(--input-bg)',
                      border: '1px solid #CCCCCC',
                      boxSizing: 'border-box',
                    }}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="shrink-0 p-2 text-gray-400 hover:text-foreground transition-colors disabled:text-gray-300"
                      title="Прикрепить файл"
                    >
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Paperclip className="w-5 h-5" />
                      )}
                    </button>

                    <input
                      ref={inputRef}
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Задайте вопрос по делу..."
                      disabled={isSending}
                      className="flex-1 bg-transparent outline-none text-base font-normal text-foreground placeholder:text-[#808080]"
                    />

                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={!message.trim() || isSending}
                      className={`shrink-0 p-2 transition-colors disabled:cursor-not-allowed ${
                        message.trim() ? 'text-foreground' : 'text-gray-400'
                      }`}
                      title="Отправить"
                    >
                      <SendHorizontal className="w-5 h-5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'documents' && (
              <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                <CaseDocumentsList
                  documents={documents}
                  isUploading={isUploading}
                  onUpload={() => fileInputRef.current?.click()}
                  onDelete={handleDeleteDocument}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
                  className="hidden"
                />
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                <CaseAnalysisPanel
                  caseData={caseData}
                  onAnalyze={handleAnalyze}
                  onGenerate={handleGenerate}
                  isAnalyzing={isSending}
                  isGenerating={isGenerating}
                  hasDocuments={documents.length > 0}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
