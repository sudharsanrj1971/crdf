import React, { useCallback, useState } from 'react';
import { UploadCloud, Image as ImageIcon } from 'lucide-react';

interface ImageDropzoneProps {
  onImageSelected: (file: File) => void;
  selectedImagePreview: string | null;
}

export function ImageDropzone({ onImageSelected, selectedImagePreview }: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onImageSelected(e.dataTransfer.files[0]);
      }
    },
    [onImageSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onImageSelected(e.target.files[0]);
      }
    },
    [onImageSelected]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-8 transition-colors flex flex-col items-center justify-center text-center cursor-pointer min-h-[300px] overflow-hidden ${
        isDragging
          ? 'border-blue-500 bg-blue-50/50'
          : 'border-slate-300 hover:border-slate-400 bg-slate-50'
      }`}
    >
      <input
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        title="Upload an image"
      />

      {selectedImagePreview ? (
        <div className="absolute inset-0 p-2">
          <img
            src={selectedImagePreview}
            alt="Selected preview"
            className="w-full h-full object-contain rounded-lg"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <div className="p-4 bg-white rounded-full shadow-sm ring-1 ring-slate-900/5">
            <UploadCloud className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <p className="font-medium text-slate-700 text-lg">
              Click or drag image to upload
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Supports JPG, PNG, WEBP (Max 10MB)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
