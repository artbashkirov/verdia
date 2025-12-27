import Image from 'next/image';

export function LogoIcon({ className = "w-10 h-11" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 45"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 0L23.5 8.5L32 5L28.5 13.5L37 17L28.5 20.5L32 29L23.5 25.5L20 34L16.5 25.5L8 29L11.5 20.5L3 17L11.5 13.5L8 5L16.5 8.5L20 0Z"
        fill="currentColor"
      />
      <path
        d="M20 10L21.5 14.5L26 13L24.5 17.5L29 19L24.5 20.5L26 25L21.5 23.5L20 28L18.5 23.5L14 25L15.5 20.5L11 19L15.5 17.5L14 13L18.5 14.5L20 10Z"
        fill="currentColor"
        opacity="0.6"
      />
      <path
        d="M7 34L10 44H14L18.5 34L20 38L21.5 34L26 44H30L33 34"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function LogoFull({ 
  variant = "dark",
  size = "default" 
}: { 
  variant?: "dark" | "light";
  size?: "default" | "small";
}) {
  // Size configurations - размеры для десктопа: высота 32px
  const dimensions = size === "small" 
    ? { width: 68, height: 24 } // Мобильная версия: 24px высота
    : { width: 113, height: 32 }; // Desktop version: высота 32px
  
  // Используем SVG логотип для обоих вариантов
  const logoSrc = variant === "light" ? "/verdiaLogo.svg" : "/verdiaLogo.svg";
  
  return (
    <Image
      src={logoSrc}
      alt="Verdia"
      width={dimensions.width}
      height={dimensions.height}
      priority
      style={{ 
        width: size === "default" ? "113px" : `${dimensions.width}px`, 
        height: size === "default" ? "32px" : `${dimensions.height}px` 
      }}
    />
  );
}
