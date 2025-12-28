'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'default' | 'small' | 'icon';
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'default', fullWidth = false, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold transition-all rounded-[16px] focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-white text-[#040308] hover:opacity-75 focus:ring-white',
      secondary: 'bg-background text-foreground hover:bg-gray-100 dark:hover:bg-[#3a3a3a] focus:ring-gray-300',
      outline: 'border border-gray-200 bg-transparent text-foreground hover:bg-gray-100 dark:hover:bg-[#3a3a3a] focus:ring-gray-300',
    };

    const sizes = {
      default: 'h-[48px] text-[16px] gap-[10px]',
      small: 'px-4 py-2 text-sm gap-2',
      icon: 'p-1 min-w-7 min-h-7',
    };

    const widthClass = fullWidth ? 'w-full' : '';

    const paddingStyle = size === 'default' ? { paddingLeft: '20px', paddingRight: '20px', paddingTop: '15px', paddingBottom: '15px' } : {};
    
    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`}
        style={paddingStyle}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };

