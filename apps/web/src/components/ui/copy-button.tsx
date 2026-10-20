'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Fallback or silent fail
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label ? `Copy ${label}` : `Copy ${value}`}
      title={copied ? 'Copied to clipboard' : label ? `Copy ${label}` : 'Copy to clipboard'}
      className={`inline-flex items-center justify-center p-1 rounded hover:bg-[#20242c] text-[#6b7280] hover:text-[#f0f2f5] transition ${className}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400 motion-reduce:transition-none" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
