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
    <div 
      className="absolute bottom-0 left-0 right-0 bg-background rounded-b-2xl z-10"
      style={{ paddingBottom: '16px' }}
    >
      <div className="flex justify-center" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
        <div 
          className="w-full md:w-[660px] flex items-center"
          style={{ 
            height: '56px',
            borderRadius: '16px',
            paddingLeft: '20px',
            paddingRight: '20px',
            gap: '8px',
            backgroundColor: resolvedTheme === 'light' ? '#ffffff' : '#1E1E1F'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder === 'Начните писать запрос...' ? 'Задайте вопрос' : placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-base font-normal text-foreground placeholder:text-[#808080]"
          />
          
          {/* Attachment button */}
          <button
            type="button"
            className="flex items-center justify-center text-foreground transition-colors"
            style={{ width: '28px', height: '28px' }}
            title="Прикрепить файл"
          >
            <AttachmentIcon style={{ width: '20px', height: '20px' }} strokeWidth="1.5" />
          </button>
          
          {/* Microphone button */}
          <button
            type="button"
            className="flex items-center justify-center text-foreground transition-colors"
            style={{ width: '28px', height: '28px' }}
            title="Голосовой ввод"
          >
            <MicrophoneIcon style={{ width: '20px', height: '20px' }} strokeWidth="1.5" />
          </button>
          
          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() || disabled}
            className={`flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
              message.trim() ? 'text-foreground' : 'text-gray-400'
            }`}
            style={{ width: '28px', height: '28px' }}
            title="Отправить"
          >
            <SendHorizontal style={{ width: '20px', height: '20px' }} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

