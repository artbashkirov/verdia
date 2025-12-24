'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { AttachmentIcon, MicrophoneIcon } from '@/components/icons';
import { SendHorizontal } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSubmit, disabled = false, placeholder = 'Начните писать запрос...' }: ChatInputProps) {
  const { resolvedTheme } = useTheme();
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSubmit(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 pb-10 bg-background rounded-b-2xl z-10">
      <div className="flex justify-center">
        <div 
          className="w-[660px] h-14 rounded-2xl flex items-center px-5 gap-2"
          style={{ 
            backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-base font-medium text-foreground placeholder:text-gray-400"
          />
          
          {/* Attachment button */}
          <button
            type="button"
            className="p-1 text-foreground transition-colors"
            title="Прикрепить файл"
          >
            <AttachmentIcon className="w-5 h-5" strokeWidth="1.5" />
          </button>
          
          {/* Microphone button */}
          <button
            type="button"
            className="p-1 text-foreground transition-colors"
            title="Голосовой ввод"
          >
            <MicrophoneIcon className="w-5 h-5" strokeWidth="1.5" />
          </button>
          
          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() || disabled}
            className={`p-1 transition-colors disabled:cursor-not-allowed ${
              message.trim() ? 'text-foreground' : 'text-gray-400'
            }`}
            title="Отправить"
          >
            <SendHorizontal className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

