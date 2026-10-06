/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileText, AlertTriangle, FileWarning } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { DocumentAnalysis } from '../types';

interface DocumentResultProps {
  result: DocumentAnalysis;
}

export function DocumentResult({ result }: DocumentResultProps) {
  if (!result.has_document) {
    return (
      <div className="text-slate-400 italic text-sm">No document was submitted.</div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Text content */}
        {!result.has_text_content ? (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-yellow-700 flex items-start gap-3">
            <FileWarning className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">No readable text found in this document.</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">
                Extracted Text
              </h3>
              {result.extracted_text && (
                <button
                  onClick={() => navigator.clipboard.writeText(result.extracted_text ?? '')}
                  className="text-xs text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy
                </button>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 max-h-60 overflow-y-auto">
              <p className="text-sm font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                {result.extracted_text || '(empty)'}
              </p>
            </div>
          </div>
        )}

        {/* Unreadable sections */}
        {result.unreadable_sections && result.unreadable_sections.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Unreadable Sections
            </h3>
            <ul className="space-y-1.5">
              {result.unreadable_sections.map((section, i) => (
                <li
                  key={i}
                  className="text-sm text-slate-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md"
                >
                  {section}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer badge */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400">Document attached and processed</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
