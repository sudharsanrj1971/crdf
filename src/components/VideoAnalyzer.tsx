import React, { useState, useRef } from "react";
import { Upload, X, FileText, AlertCircle, Video } from "lucide-react";
import { motion } from "motion/react";
import type { AnalysisResult, AnalysisResponse } from "../types";

interface VideoAnalyzerProps {
  onStart: () => void;
  onComplete: (result: AnalysisResult) => void;
  onError: (error: string) => void;
}

export function VideoAnalyzer({ onStart, onComplete, onError }: VideoAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [claim, setClaim] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith("video/")) {
        setFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !claim) return;

    onStart();

    const formData = new FormData();
    formData.append("video", file);
    formData.append("claim", claim);

    try {
      const response = await fetch("/api/analyze-video", {
        method: "POST",
        body: formData,
      });

      const data: AnalysisResponse = await response.json();

      if (data.success && data.result) {
        onComplete(data.result);
      } else {
        onError(data.error || "Failed to analyze video evidence.");
      }
    } catch (err) {
      onError("Network error. Please ensure the file size is under 20MB.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <label className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-tighter">
          Video Evidence
        </label>
        
        {!file ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative group cursor-pointer
              border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200
              ${dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300 bg-slate-50/50"}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <p className="text-slate-900 font-bold mb-1">Upload Evidence File</p>
            <p className="text-slate-500 text-sm">Drag and drop or click to browse (MP4, MOV, max 20MB)</p>
          </div>
        ) : (
          <div className="relative bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <Video className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for analysis</p>
            </div>
            <button
              type="button"
              onClick={() => setFile(null)}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="mt-8">
          <label htmlFor="claim" className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-tighter">
            Specific Claim to Verify
          </label>
          <div className="relative">
            <FileText className="absolute left-4 top-4 w-5 h-5 text-slate-400" />
            <textarea
              id="claim"
              rows={3}
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="Describe the claim this video is supposed to support (e.g., 'This video shows a high-speed chase on Highway 101 yesterday afternoon.')"
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all resize-none"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!file || !claim}
          className="w-full mt-8 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
        >
          Begin Multimedia Audit
        </button>

        <div className="mt-6 flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] text-amber-800 font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Analysis is performed by a dedicated neural agent. Results should be reviewed by human intelligence.</span>
        </div>
      </div>
    </form>
  );
}
