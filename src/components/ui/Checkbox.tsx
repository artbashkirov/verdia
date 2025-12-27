'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, id, checked, ...props }, ref) => {
    const checkmarkUrl = "data:image/svg+xml,%3Csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3E%3C/svg%3E";
    
    return (
      <div className="flex items-start gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={checked}
          className={`
            w-[18px] h-[18px] mt-0.5
            bg-[#202124] border border-[#202124] rounded-[3px]
            appearance-none cursor-pointer shrink-0
            focus:outline-none focus:ring-2 focus:ring-[#312ecb] focus:ring-offset-2
            transition-all
            ${className}
          `}
          style={{
            backgroundImage: checked ? `url("${checkmarkUrl}")` : 'none',
            backgroundSize: '12px 12px',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
          {...props}
        />
        {label && (
          <label htmlFor={id} className="text-[13px] text-white cursor-pointer leading-normal">
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };

