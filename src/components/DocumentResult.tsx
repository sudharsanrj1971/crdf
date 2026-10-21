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
          <div className="bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] rounded-[var(--radius-md)] p-3.5 text-[var(--status-warning)] flex items-start gap-2.5">
            <FileWarning className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium">No readable text found in this document.</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Extracted Text
              </h3>
              {result.extracted_text && (
                <button
                  onClick={() => navigator.clipboard.writeText(result.extracted_text ?? '')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy
                </button>
              )}
            </div>
            <div className="bg-[var(--glass-bg-subtle)] rounded-[var(--radius-md)] p-3.5 border border-[var(--glass-border-subtle)] max-h-60 overflow-y-auto">
              <p className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {result.extracted_text || '(empty)'}
              </p>
            </div>
          </div>
        )}

        {/* Unreadable sections */}
        {result.unreadable_sections && result.unreadable_sections.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-[var(--status-warning)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Unreadable Sections
            </h3>
            <ul className="space-y-1.5">
              {result.unreadable_sections.map((section, i) => (
                <li
                  key={i}
                  className="text-xs text-[var(--status-warning)] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] px-3 py-1.5 rounded-[var(--radius-sm)]"
                >
                  {section}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer badge */}
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--glass-border-subtle)]">
          <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span className="text-[11px] text-[var(--text-muted)]">Document attached and processed</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
