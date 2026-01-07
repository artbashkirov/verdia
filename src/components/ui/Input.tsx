'use client';

import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { EyeIcon, EyeOffIcon } from '@/components/icons';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', type = 'text', label, error, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            className={`
              w-full h-[48px] text-base
              text-foreground
              border-0 rounded-[16px]
              placeholder:text-secondary-text
              focus:outline-none
              transition-colors
              ${error ? 'border-red-500' : ''}
              ${className}
            `}
            style={{ 
              paddingLeft: '20px', 
              paddingRight: isPassword ? '48px' : '20px', 
              paddingTop: '16px', 
              paddingBottom: '16px',
              backgroundColor: 'var(--gray-100)'
            }}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-[20px] top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-secondary-text hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeIcon className="w-4 h-4" />
              ) : (
                <EyeOffIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };

