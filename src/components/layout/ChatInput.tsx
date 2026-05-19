'use client';

import {
  useState,
  useRef,
  useEffect,
  KeyboardEvent,
  ChangeEvent,
  DragEvent,
} from 'react';
import { SendHorizontal, Paperclip, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatAttachmentSize,
  MAX_CHAT_ATTACHMENTS,
  type ChatAttachment,
} from '@/types/chat-attachment';

interface ChatInputProps {
  onSubmit: (message: string, attachments?: ChatAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  allowAttachments?: boolean;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
];

const ACCEPTED_TYPES_ATTR = ACCEPTED_TYPES.join(',');
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

interface PendingUpload {
  localId: string;
  fileName: string;
  size: number;
}

interface QueuedFile {
  localId: string;
  file: File;
}

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'docx' || ext === 'txt' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp';
}

export function ChatInput({
  onSubmit,
  disabled = false,
  placeholder = 'Начните писать запрос...',
  allowAttachments = true,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [containerBottom, setContainerBottom] = useState<number>(0);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const attachmentsRef = useRef<ChatAttachment[]>([]);
  const uploadQueueRef = useRef<QueuedFile[]>([]);
  const isDrainingQueueRef = useRef(false);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);

  attachmentsRef.current = attachments;
  pendingUploadsRef.current = pendingUploads;

  useEffect(() => {
    function updatePosition() {
      if (!containerRef.current) return;

      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (mobile) {
        let bottomBarHeight = 0;

        if (window.visualViewport) {
          const viewportHeight = window.visualViewport.height;
          const windowHeight = window.innerHeight;
          const offsetTop = window.visualViewport.offsetTop || 0;
          const totalBrowserUI = windowHeight - viewportHeight;
          bottomBarHeight = Math.max(totalBrowserUI - offsetTop, 0);
          if (bottomBarHeight > 150) bottomBarHeight = 55;
        } else {
          const heightDiff = window.innerHeight - document.documentElement.clientHeight;
          bottomBarHeight = heightDiff > 0 && heightDiff < 100 ? heightDiff : 55;
        }

        let safeAreaBottomValue = 0;
        try {
          const testEl = document.createElement('div');
          testEl.style.position = 'fixed';
          testEl.style.bottom = '0';
          testEl.style.paddingBottom = 'env(safe-area-inset-bottom)';
          testEl.style.visibility = 'hidden';
          testEl.style.pointerEvents = 'none';
          document.body.appendChild(testEl);
          const paddingBottom = window.getComputedStyle(testEl).paddingBottom;
          if (paddingBottom && paddingBottom !== '0px' && paddingBottom !== 'auto') {
            safeAreaBottomValue = parseFloat(paddingBottom) || 0;
          }
          document.body.removeChild(testEl);
        } catch {
          // ignore
        }

        const finalBottom = bottomBarHeight + 8 + safeAreaBottomValue;
        setContainerBottom(finalBottom);

        containerRef.current.style.position = 'fixed';
        containerRef.current.style.bottom = `${finalBottom}px`;
        containerRef.current.style.left = '0';
        containerRef.current.style.right = '0';
        containerRef.current.style.width = '100%';
        containerRef.current.style.display = 'block';
        containerRef.current.style.top = 'auto';
        containerRef.current.style.minHeight = '72px';
      } else {
        containerRef.current.style.position = 'absolute';
        containerRef.current.style.bottom = '0';
        containerRef.current.style.left = '0';
        containerRef.current.style.right = '0';
        containerRef.current.style.width = '100%';
      }
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updatePosition);
    window.addEventListener('orientationchange', () => setTimeout(updatePosition, 200));

    return () => {
      window.removeEventListener('resize', updatePosition);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', updatePosition);
    };
  }, []);

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = async (file: File): Promise<ChatAttachment | null> => {
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`${file.name}: файл слишком большой (максимум 20 МБ).`);
      return null;
    }
    if (!isAcceptedFile(file)) {
      toast.error(`${file.name}: формат не поддерживается.`);
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/chat/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Не удалось загрузить файл';
      try {
        const data = await response.json();
        if (data?.error) errorMessage = data.error;
      } catch {
        errorMessage = `Ошибка ${response.status}`;
      }
      toast.error(`${file.name}: ${errorMessage}`);
      return null;
    }

    const data = (await response.json()) as { attachment?: ChatAttachment };
    if (!data.attachment) {
      toast.error(`${file.name}: сервер вернул пустой ответ`);
      return null;
    }

    return data.attachment;
  };

  const drainUploadQueue = async () => {
    if (isDrainingQueueRef.current) return;
    isDrainingQueueRef.current = true;

    let batchSucceeded = 0;
    let batchFailed = 0;

    try {
      while (uploadQueueRef.current.length > 0) {
        const slotsLeft = MAX_CHAT_ATTACHMENTS - attachmentsRef.current.length;
        if (slotsLeft <= 0) {
          const skipped = uploadQueueRef.current.length;
          uploadQueueRef.current = [];
          setPendingUploads([]);
          if (skipped > 0) {
            toast.error(`Можно прикрепить не больше ${MAX_CHAT_ATTACHMENTS} документов.`);
          }
          break;
        }

        const batch = uploadQueueRef.current.splice(0, slotsLeft);
        batchSucceeded = 0;
        batchFailed = 0;

        for (const { file, localId } of batch) {
          setUploadingCount((count) => count + 1);
          try {
            const attachment = await uploadFile(file);
            if (attachment) {
              batchSucceeded += 1;
              setAttachments((prev) => {
                const next = [...prev, attachment].slice(0, MAX_CHAT_ATTACHMENTS);
                attachmentsRef.current = next;
                return next;
              });
            } else {
              batchFailed += 1;
            }
          } catch (err) {
            batchFailed += 1;
            console.error('[ChatInput] upload failed:', file.name, err);
          } finally {
            setPendingUploads((prev) => prev.filter((item) => item.localId !== localId));
            setUploadingCount((count) => Math.max(0, count - 1));
          }
        }

        if (batch.length > 1) {
          if (batchFailed === 0) {
            toast.success(`Загружено файлов: ${batchSucceeded}`);
          } else if (batchSucceeded > 0) {
            toast.error(`Загружено ${batchSucceeded} из ${batch.length} файлов`);
          }
        }
      }
    } catch (err) {
      console.error('[ChatInput] queue drain error:', err);
      toast.error('Не удалось загрузить файлы. Проверьте соединение.');
      setPendingUploads([]);
    } finally {
      isDrainingQueueRef.current = false;
      resetFileInput();
      if (uploadQueueRef.current.length > 0) {
        void drainUploadQueue();
      }
    }
  };

  const enqueueFiles = (files: FileList | File[]) => {
    if (disabled) return;

    const incoming = Array.from(files);
    if (!incoming.length) return;

    const slotsLeft =
      MAX_CHAT_ATTACHMENTS -
      attachmentsRef.current.length -
      uploadQueueRef.current.length -
      pendingUploadsRef.current.length;
    if (slotsLeft <= 0) {
      toast.error(`Можно прикрепить не больше ${MAX_CHAT_ATTACHMENTS} документов.`);
      resetFileInput();
      return;
    }

    const accepted = incoming.slice(0, slotsLeft);
    if (incoming.length > slotsLeft) {
      toast.error(`Добавлены первые ${slotsLeft} из ${incoming.length} — лимит ${MAX_CHAT_ATTACHMENTS} файлов.`);
    }

    const queued = accepted.map((file) => ({
      localId: createLocalId(),
      file,
    }));

    setPendingUploads((prev) => [
      ...prev,
      ...queued.map(({ localId, file }) => ({
        localId,
        fileName: file.name,
        size: file.size,
      })),
    ]);

    uploadQueueRef.current.push(...queued);
    void drainUploadQueue();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) enqueueFiles(files);
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!allowAttachments || disabled) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (!allowAttachments || disabled) return;
    if (e.dataTransfer.files?.length) enqueueFiles(e.dataTransfer.files);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      attachmentsRef.current = next;
      return next;
    });
  };

  const removePendingUpload = (localId: string) => {
    uploadQueueRef.current = uploadQueueRef.current.filter((item) => item.localId !== localId);
    setPendingUploads((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handleSubmit = () => {
    if (disabled || uploadingCount > 0) return;
    if (!message.trim() && attachments.length === 0) return;

    onSubmit(message.trim(), attachments.length ? attachments : undefined);
    setMessage('');
    setAttachments([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isUploading = uploadingCount > 0 || pendingUploads.length > 0;
  const canSend = (message.trim().length > 0 || attachments.length > 0) && !disabled && !isUploading;
  const showAttachments = allowAttachments;
  const atAttachmentLimit =
    attachments.length + pendingUploads.length >= MAX_CHAT_ATTACHMENTS;
  const hasAttachmentPreviews = attachments.length > 0 || pendingUploads.length > 0;

  return (
    <>
      {isMobile && containerBottom > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            height: `${containerBottom + 72}px`,
            backgroundColor: 'var(--background)',
            zIndex: 38,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        ref={containerRef}
        className="left-0 right-0 z-40 md:z-50 chat-input-container"
        style={{
          paddingTop: '0',
          paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom, 0px))' : '16px',
          backgroundColor: 'var(--background)',
        }}
      >
        <div
          className="flex justify-center relative z-10"
          style={{
            paddingLeft: '16px',
            paddingRight: '16px',
            paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom, 0px))' : '0',
            backgroundColor: 'var(--background)',
            position: 'relative',
          }}
        >
          <div
            className="w-full md:w-[660px] flex flex-col"
            style={{ gap: '8px' }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {hasAttachmentPreviews && (
              <div className="flex flex-wrap gap-2">
                {pendingUploads.map((pending) => (
                  <div
                    key={pending.localId}
                    className="max-w-full flex items-center"
                    style={{
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--input-bg)',
                      border: '1px solid #CCCCCC',
                      boxSizing: 'border-box',
                      opacity: 0.75,
                    }}
                  >
                    <Loader2
                      style={{ width: '16px', height: '16px', flexShrink: 0 }}
                      className="animate-spin text-foreground"
                      strokeWidth={2}
                    />
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-foreground truncate"
                        style={{ fontSize: '13px', lineHeight: '16px', fontWeight: 500 }}
                        title={pending.fileName}
                      >
                        {pending.fileName}
                      </span>
                      <span
                        className="text-[#808080]"
                        style={{ fontSize: '11px', lineHeight: '14px' }}
                      >
                        {formatAttachmentSize(pending.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingUpload(pending.localId)}
                      className="text-[#808080] hover:text-foreground transition-colors"
                      style={{
                        width: '20px',
                        height: '20px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Отменить загрузку"
                      aria-label={`Отменить загрузку ${pending.fileName}`}
                    >
                      <X style={{ width: '16px', height: '16px' }} strokeWidth={2} />
                    </button>
                  </div>
                ))}
                {attachments.map((attachment, index) => (
                  <div
                    key={`${attachment.fileName}-${attachment.size}-${attachment.extractedText.length}-${index}`}
                    className="max-w-full flex items-center"
                    style={{
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--input-bg)',
                      border: '1px solid #CCCCCC',
                      boxSizing: 'border-box',
                    }}
                  >
                    <Paperclip
                      style={{ width: '16px', height: '16px', flexShrink: 0 }}
                      strokeWidth={2}
                      className="text-foreground"
                    />
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-foreground truncate"
                        style={{ fontSize: '13px', lineHeight: '16px', fontWeight: 500 }}
                        title={attachment.fileName}
                      >
                        {attachment.fileName}
                      </span>
                      <span
                        className="text-[#808080]"
                        style={{ fontSize: '11px', lineHeight: '14px' }}
                      >
                        {formatAttachmentSize(attachment.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(index)}
                      disabled={isUploading}
                      className="text-[#808080] hover:text-foreground transition-colors disabled:opacity-50"
                      style={{
                        width: '20px',
                        height: '20px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Убрать документ"
                      aria-label={`Убрать ${attachment.fileName}`}
                    >
                      <X style={{ width: '16px', height: '16px' }} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="w-full flex items-center overflow-hidden"
              style={{
                height: '56px',
                borderRadius: '20px',
                paddingLeft: '20px',
                paddingRight: '20px',
                gap: '8px',
                backgroundColor: 'var(--input-bg)',
                border: '1px solid #CCCCCC',
                boxSizing: 'border-box',
                outline: isDragging ? '2px solid #808080' : 'none',
                outlineOffset: '0px',
              }}
            >
              {showAttachments && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES_ATTR}
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  aria-hidden="true"
                  tabIndex={-1}
                />
              )}

              {showAttachments && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || isUploading || atAttachmentLimit}
                  className={`flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
                    attachments.length > 0 ? 'text-foreground' : 'text-[#808080] hover:text-foreground'
                  }`}
                  style={{ width: '28px', height: '28px', flexShrink: 0 }}
                  title={
                    atAttachmentLimit
                      ? `Достигнут лимит ${MAX_CHAT_ATTACHMENTS} файлов`
                      : isUploading
                        ? 'Загрузка...'
                        : 'Прикрепить документы (PDF, DOCX, JPG, PNG, TXT — до 20 МБ каждый)'
                  }
                  aria-label="Прикрепить документы"
                >
                  {isUploading ? (
                    <Loader2 style={{ width: '20px', height: '20px' }} className="animate-spin" strokeWidth={2} />
                  ) : (
                    <Paperclip style={{ width: '20px', height: '20px' }} strokeWidth={2} />
                  )}
                </button>
              )}

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

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSend}
                className={`flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
                  canSend ? 'text-foreground' : 'text-gray-400'
                }`}
                style={{ width: '28px', height: '28px' }}
                title="Отправить"
              >
                <SendHorizontal style={{ width: '20px', height: '20px' }} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
