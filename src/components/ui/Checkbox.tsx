'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-[15px]">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          className={`
            w-[18px] h-[18px]
            border border-black rounded-[3px]
            appearance-none cursor-pointer
            checked:bg-[#212121] checked:border-[#212121]
            checked:bg-[url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")]
            checked:bg-center checked:bg-no-repeat
            focus:outline-none focus:ring-2 focus:ring-[#312ecb] focus:ring-offset-2
            transition-colors
            ${className}
          `}
          {...props}
        />
        {label && (
          <label htmlFor={id} className="text-sm text-[#040308] cursor-pointer">
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };

