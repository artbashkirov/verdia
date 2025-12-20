'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'small' | 'icon';
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'default', fullWidth = false, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold transition-colors rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-[#212121] text-white hover:bg-[#3a3a3a] focus:ring-[#212121]',
      secondary: 'bg-white text-black hover:bg-gray-100 focus:ring-gray-300',
      outline: 'border border-[#d9d9d9] bg-transparent text-black hover:bg-gray-50 focus:ring-gray-300',
    };

    const sizes = {
      default: 'px-5 py-[15px] text-base gap-2.5',
      small: 'px-4 py-2 text-sm gap-2',
      icon: 'p-1 min-w-7 min-h-7',
    };

    const widthClass = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };

