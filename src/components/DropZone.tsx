import React, { useRef, useState, DragEvent } from 'react';
import { Image, Video, FileText, X, AlertCircle, CheckCircle2, Upload } from 'lucide-react';

export interface DropZoneProps {
  type: 'image' | 'video' | 'document';
  title: string;
  formatsDesc: string;
  maxSizeBytes: number;
  maxSizeLabel: string;
  allowedExtensions: string[];
  file: File | null;
  onFileSelect: (file: File | null) => void;
  error: string | null;
  onErrorChange: (err: string | null) => void;
  disabled?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({
  type,
  title,
  formatsDesc,
  maxSizeBytes,
  maxSizeLabel,
  allowedExtensions,
  file,
  onFileSelect,
  error,
  onErrorChange,
  disabled = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (candidate: File) => {
    const ext = candidate.name.split('.').pop()?.toLowerCase() || '';

    // Extension check
    if (!allowedExtensions.includes(ext)) {
      onErrorChange(`That isn't a supported ${type} file.`);
      onFileSelect(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    // Size check
    if (candidate.size > maxSizeBytes) {
      onErrorChange(`File is over ${maxSizeLabel}.`);
      onFileSelect(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    // Valid file
    onErrorChange(null);
    onFileSelect(candidate);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFile = e.target.files?.[0];
    if (chosenFile) {
      validateAndSetFile(chosenFile);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    onErrorChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const renderIcon = () => {
    switch (type) {
      case 'image':
        return <Image className="w-7 h-7 text-[var(--accent-indigo)] group-hover:scale-105 transition-transform" />;
      case 'video':
        return <Video className="w-7 h-7 text-[var(--accent-cyan)] group-hover:scale-105 transition-transform" />;
      case 'document':
        return <FileText className="w-7 h-7 text-indigo-500 group-hover:scale-105 transition-transform" />;
    }
  };

  const formatSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    if (mb < 0.1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="flex flex-col w-full">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={allowedExtensions.map((e) => `.${e}`).join(',')}
        disabled={disabled}
        onChange={handleInputChange}
        id={`file-upload-${type}`}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${title}. ${formatsDesc}. Maximum size ${maxSizeLabel}. ${
          file ? `Attached file: ${file.name}` : 'Click or drop file to attach.'
        }`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative flex flex-col justify-center items-center text-center p-4 min-h-[140px] rounded-[18px] transition-all duration-200 cursor-pointer select-none ${
          file
            ? 'border-2 border-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/15 shadow-xs'
            : isDragOver
            ? 'border-2 border-solid border-[var(--accent-indigo)] bg-[var(--accent-indigo)]/10 scale-[1.01] shadow-md'
            : error
            ? 'border-2 border-dashed border-rose-500/80 bg-rose-500/5 hover:border-rose-500'
            : 'border-2 border-dashed border-[var(--glass-border-subtle)] bg-[var(--glass-bg-subtle)] hover:border-solid hover:border-[var(--accent-indigo)] hover:bg-[var(--glass-bg)] hover:shadow-xs'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {file ? (
          // Attached File State
          <div className="flex flex-col items-center w-full px-1">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[190px] w-full text-center" title={file.name}>
              {file.name}
            </p>
            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
              {formatSize(file.size)}
            </p>
            <button
              type="button"
              aria-label={`Remove attached ${type}: ${file.name}`}
              onClick={handleRemove}
              className="mt-2.5 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        ) : (
          // Empty Drop State
          <div className="flex flex-col items-center">
            <div className="w-11 h-11 rounded-full bg-[var(--glass-bg-elevated)] border border-[var(--glass-border)] flex items-center justify-center shadow-xs mb-2">
              {renderIcon()}
            </div>
            <span className="text-xs font-bold text-[var(--text-primary)] leading-tight">
              {title}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] mt-1 font-medium leading-tight">
              {formatsDesc} • Max {maxSizeLabel}
            </span>
          </div>
        )}
      </div>

      {/* Inline Validation Error */}
      {error && (
        <div
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 px-1"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
