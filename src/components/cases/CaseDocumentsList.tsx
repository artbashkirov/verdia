'use client';

import { FileText, Trash2, Upload, Loader2, Image as ImageIcon, File } from 'lucide-react';
import type { CaseDocument } from '@/types/database';

interface CaseDocumentsListProps {
  documents: CaseDocument[];
  isUploading: boolean;
  onUpload: () => void;
  onDelete: (docId: string) => void;
}

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  image: ImageIcon,
  text: File,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function CaseDocumentsList({ documents, isUploading, onUpload, onDelete }: CaseDocumentsListProps) {
  return (
    <div className="flex flex-col gap-4 max-w-[720px] mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-medium text-foreground">
          Документы дела
        </h2>
        <button
          onClick={onUpload}
          disabled={isUploading}
          className="flex items-center gap-1.5 text-[14px] font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-300 transition-colors"
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Загрузить
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-500">Нет загруженных документов</p>
          <p className="text-[13px] text-gray-400 mt-1">
            Загрузите исковое заявление, доказательства и другие документы
          </p>
          <button
            onClick={onUpload}
            className="flex items-center gap-2 mt-4 h-10 px-4 bg-foreground text-background rounded-xl hover:opacity-80 transition-opacity text-[14px] font-medium"
          >
            <Upload className="w-4 h-4" />
            Загрузить документ
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => {
            const Icon = FILE_TYPE_ICONS[doc.file_type] || File;
            return (
              <div
                key={doc.id}
                className="group flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground truncate">
                    {doc.file_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] text-gray-400 uppercase">
                      {doc.file_type}
                    </span>
                    <span className="text-[12px] text-gray-300">·</span>
                    <span className="text-[12px] text-gray-400">
                      {formatFileSize(doc.file_size)}
                    </span>
                    {doc.analysis?.document_type && (
                      <>
                        <span className="text-[12px] text-gray-300">·</span>
                        <span className="text-[12px] text-gray-500">
                          {doc.analysis.document_type}
                        </span>
                      </>
                    )}
                  </div>
                  {doc.analysis?.key_facts && doc.analysis.key_facts.length > 0 && (
                    <p className="text-[13px] text-gray-500 mt-1 line-clamp-2">
                      {doc.analysis.key_facts[0]}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onDelete(doc.id)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="Удалить документ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
