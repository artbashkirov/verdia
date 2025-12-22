export function EyeOffIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.99902 3L20.999 21M9.8433 9.91364C9.32066 10.4536 8.99902 11.1892 8.99902 12C8.99902 13.6569 10.3422 15 11.999 15C12.8215 15 13.5667 14.669 14.1086 14.133M6.49902 6.64715C4.59972 7.90034 3.15305 9.78394 2.45703 12C3.73128 16.0571 7.52159 19 11.9992 19C13.9881 19 15.8414 18.4194 17.3988 17.4184M10.999 5.04939C11.328 5.01673 11.6617 5 11.9992 5C16.4769 5 20.2672 7.94291 21.5414 12C21.2607 12.894 20.8577 13.7338 20.3522 14.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EyeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 5C7.52344 5 3.73177 7.94288 2.45703 12C3.73177 16.0571 7.52344 19 12 19C16.4766 19 20.2682 16.0571 21.543 12C20.2682 7.94288 16.4766 5 12 5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 3.33334V12.6667M3.33333 8H12.6667"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MessageIcon({ className = "w-[18px] h-[18px]", strokeWidth = "1.5" }: { className?: string; strokeWidth?: string | number }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.25 6.75H12.75M5.25 9.75H9.75M15.75 9C15.75 12.7279 12.7279 15.75 9 15.75C7.85068 15.75 6.76925 15.4626 5.81968 14.9551L2.25 15.75L3.04491 12.1803C2.53739 11.2308 2.25 10.1493 2.25 9C2.25 5.27208 5.27208 2.25 9 2.25C12.7279 2.25 15.75 5.27208 15.75 9Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NewMessageIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 8V16M8 12H16M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TrashIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.25 4.5H15.75M6.75 4.5V3C6.75 2.17157 7.42157 1.5 8.25 1.5H9.75C10.5784 1.5 11.25 2.17157 11.25 3V4.5M7.5 8.25V12.75M10.5 8.25V12.75M13.5 4.5V15C13.5 15.8284 12.8284 16.5 12 16.5H6C5.17157 16.5 4.5 15.8284 4.5 15V4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HelpCircleIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9 16.5C13.1421 16.5 16.5 13.1421 16.5 9C16.5 4.85786 13.1421 1.5 9 1.5C4.85786 1.5 1.5 4.85786 1.5 9C1.5 13.1421 4.85786 16.5 9 16.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.81738 6.75C6.99368 6.24875 7.34167 5.82608 7.79902 5.5535C8.25637 5.28092 8.79459 5.17494 9.32017 5.25352C9.84576 5.33211 10.3263 5.59057 10.6791 5.98421C11.0319 6.37785 11.2348 6.88193 11.25 7.40625C11.25 9 8.9375 9.75 8.9375 9.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="12.75" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function ChevronDownIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.5 6.75L9 11.25L13.5 6.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AttachmentIcon({ className = "w-[18px] h-[18px]", strokeWidth = "1.5" }: { className?: string; strokeWidth?: string | number }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M15.75 8.25L9.53033 14.4697C7.87348 16.1265 5.12652 16.1265 3.46967 14.4697C1.81282 12.8128 1.81282 10.0659 3.46967 8.40901L9.53033 2.34835C10.6009 1.27778 12.3284 1.27778 13.399 2.34835C14.4696 3.41893 14.4696 5.14645 13.399 6.21703L7.40901 12.206C6.87372 12.7413 6.01 12.7413 5.47471 12.206C4.93942 11.6707 4.93942 10.807 5.47471 10.2717L10.875 4.875"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MicrophoneIcon({ className = "w-4 h-4", strokeWidth = "1.5" }: { className?: string; strokeWidth?: string | number }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1C6.89543 1 6 1.89543 6 3V8C6 9.10457 6.89543 10 8 10C9.10457 10 10 9.10457 10 8V3C10 1.89543 9.10457 1 8 1Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 7V8C13 10.7614 10.7614 13 8 13C5.23858 13 3 10.7614 3 8V7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 13V15"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SendIcon({ className = "w-5 h-5", strokeWidth = "1.5" }: { className?: string; strokeWidth?: string | number }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 12h16"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DownloadIcon({ className = "w-[18px] h-[18px]", strokeWidth = "1.5" }: { className?: string; strokeWidth?: string | number }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2.25 12.75V14.25C2.25 15.0784 2.92157 15.75 3.75 15.75H14.25C15.0784 15.75 15.75 15.0784 15.75 14.25V12.75M12.75 9L9 12.75M9 12.75L5.25 9M9 12.75V2.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SunIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="3.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 1.5V3M9 15V16.5M16.5 9H15M3 9H1.5M14.773 3.227L13.773 4.227M4.227 13.773L3.227 14.773M14.773 14.773L13.773 13.773M4.227 4.227L3.227 3.227" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 2.25C7.5 5.56371 10.1863 8.25 13.5 8.25C13.9142 8.25 14.25 8.58579 14.25 9C14.25 9.41421 13.9142 9.75 13.5 9.75C9.35786 9.75 6 6.39214 6 2.25C6 1.83579 6.33579 1.5 6.75 1.5C7.16421 1.5 7.5 1.83579 7.5 2.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MonitorIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.25" y="3.75" width="13.5" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 12.75H12M7.5 15.75H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

