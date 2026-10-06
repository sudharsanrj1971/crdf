import React, { useState } from 'react';
import { ImageDropzone } from './components/ImageDropzone';
import { AssessmentResult } from './components/AssessmentResult';
import { AuthenticityAssessmentResult } from './types';
import { Loader2, Search, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [claim, setClaim] = useState('');
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AuthenticityAssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageSelected = (file: File) => {
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setResult(null);
    setError(null);
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data:image/...;base64, prefix
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAnalyze = async () => {
    if (!selectedFile || !claim.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const base64 = await toBase64(selectedFile);
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: selectedFile.type,
          claim: claim.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to analyze image');
      }

      const data: AuthenticityAssessmentResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="p-2 bg-slate-900 rounded-lg text-white shadow-sm">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">CRDF Authenticity Agent</h1>
            <p className="text-sm text-slate-500 font-medium">Visual Evidence Verification</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
          
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4">1. Provide Evidence</h2>
              <ImageDropzone 
                onImageSelected={handleImageSelected} 
                selectedImagePreview={previewUrl} 
              />
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4">2. Context & Claim</h2>
              <p className="text-sm text-slate-500 mb-3">
                What is the context of this image? What is the claim being made?
              </p>
              <textarea
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
                placeholder="e.g. 'Photo taken during the protests in downtown Seattle yesterday.'"
                className="w-full h-32 p-3 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none text-sm leading-relaxed"
              />
              
              <button
                onClick={handleAnalyze}
                disabled={!selectedFile || !claim.trim() || isAnalyzing}
                className="w-full mt-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing Evidence...
                  </>
                ) : (
                  'Analyze Evidence'
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 min-h-[600px]">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                Analysis Report
              </h2>

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="animate-pulse font-medium">Inspecting image artifacts and metadata...</p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-start gap-3">
                  <div className="mt-0.5"><AlertTriangle className="w-5 h-5" /></div>
                  <div>
                    <p className="font-semibold">Analysis Failed</p>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {!isAnalyzing && !error && !result && (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p>Upload an image and provide a claim to begin analysis.</p>
                </div>
              )}

              {result && !isAnalyzing && (
                <AssessmentResult result={result} />
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
