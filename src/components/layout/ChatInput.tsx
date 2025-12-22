'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { AttachmentIcon, MicrophoneIcon, SendIcon } from '@/components/icons';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSubmit, disabled = false, placeholder = 'Начните писать запрос...' }: ChatInputProps) {
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
    <div className="absolute bottom-0 left-0 right-0 pb-10 pt-5 bg-gradient-to-t from-white/80 via-white/80 to-transparent backdrop-blur-xl">
      <div className="flex justify-center">
        <div className="w-[660px] h-14 bg-white/80 border border-black/20 rounded-2xl flex items-center px-5 gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-base font-medium text-[#040308] placeholder:text-[#808080]"
          />
          
          {/* Attachment button */}
          <button
            type="button"
            className="p-1 text-[#040308] transition-colors"
            title="Прикрепить файл"
          >
            <AttachmentIcon className="w-5 h-5" strokeWidth="1.5" />
          </button>
          
          {/* Microphone button */}
          <button
            type="button"
            className="p-1 text-[#040308] transition-colors"
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
              message.trim() ? 'text-[#040308]' : 'text-[#808080]'
            }`}
            title="Отправить"
          >
            <SendIcon className="w-5 h-5" strokeWidth="1.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

