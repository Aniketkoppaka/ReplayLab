import React from 'react';

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full rounded border border-[#222630] bg-[#13161c] overflow-hidden">
      <div className="h-9 border-b border-[#222630] bg-[#181b22] px-4 flex items-center">
        <div className="h-3 w-1/4 bg-[#20242c] rounded motion-safe:animate-pulse motion-reduce:animate-none" />
      </div>
      <div className="divide-y divide-[#222630]">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="px-4 py-3 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, cIdx) => (
              <div
                key={cIdx}
                className="h-3.5 bg-[#181b22] rounded motion-safe:animate-pulse motion-reduce:animate-none"
                style={{ width: `${Math.max(15, 100 / cols - 5)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="p-4 rounded border border-[#222630] bg-[#13161c] space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-6 w-6 rounded bg-[#181b22] motion-safe:animate-pulse motion-reduce:animate-none" />
            <div className="h-4 w-12 rounded bg-[#181b22] motion-safe:animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="h-4 w-3/4 rounded bg-[#181b22] motion-safe:animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-full rounded bg-[#181b22] motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
