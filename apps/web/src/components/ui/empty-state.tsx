import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const finalActionLabel = actionLabel || action?.label;
  const finalOnAction = onAction || action?.onClick;

  return (
    <div className="rounded border border-[#222630] bg-[#13161c] p-8 text-center flex flex-col items-center justify-center space-y-3">
      <div className="h-10 w-10 rounded bg-[#181b22] border border-[#2d3340] flex items-center justify-center text-[#9aa2b1]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[#f0f2f5]">{title}</h3>
        <p className="text-xs text-[#9aa2b1] max-w-sm leading-relaxed">{description}</p>
      </div>
      {finalActionLabel && finalOnAction && (
        <button
          type="button"
          onClick={finalOnAction}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-[#0e1015] transition"
        >
          {finalActionLabel}
        </button>
      )}
    </div>
  );
}
