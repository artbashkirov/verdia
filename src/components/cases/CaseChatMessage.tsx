'use client';

import { User, Bot, FileUp, FileCheck, AlertTriangle } from 'lucide-react';
import { MarkdownRenderer } from '@/components/ui';
import type { CaseMessage } from '@/types/database';

interface CaseChatMessageProps {
  message: CaseMessage;
}

const ICON_MAP: Record<string, typeof Bot> = {
  document_upload: FileUp,
  document_generated: FileCheck,
  quality_gate: AlertTriangle,
};

export function CaseChatMessage({ message }: CaseChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const MessageIcon = isUser ? User : (ICON_MAP[message.message_type] || Bot);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-foreground text-background'
            : isSystem
            ? 'bg-orange-100 text-orange-600'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        <MessageIcon className="w-3.5 h-3.5" />
      </div>
      <div
        className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}
        style={{ maxWidth: 'calc(100% - 40px)' }}
      >
        <div
          className={`inline-block px-4 py-2.5 rounded-2xl text-[15px] leading-[22px] ${
            isUser
              ? 'bg-foreground text-background rounded-tr-md'
              : isSystem
              ? 'bg-orange-50 text-foreground border border-orange-100 rounded-tl-md'
              : 'bg-gray-100 text-foreground rounded-tl-md'
          } ${!isUser ? '' : 'whitespace-pre-wrap'}`}
          style={{ maxWidth: '100%', wordBreak: 'break-word' }}
        >
          {isUser ? message.content : <MarkdownRenderer content={message.content} className="prose prose-sm max-w-none" />}
        </div>
        <div
          className={`text-[12px] text-gray-400 mt-1 ${isUser ? 'text-right' : ''}`}
        >
          {new Date(message.created_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}
