export function PinkPixelSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative w-12 h-12">
        {/* Pink pixel-art spinner: 4 squares rotating */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: '0.8s' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-pink-400 rounded-sm" style={{ imageRendering: 'pixelated' }} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-pink-500 rounded-sm" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-pink-600 rounded-sm" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-pink-300 rounded-sm" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 bg-pink-200 rounded-sm animate-pulse-soft" />
        </div>
      </div>
    </div>
  );
}

export function PinkPixelBars({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-end justify-center gap-1 h-8 ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-1.5 bg-pink-400 rounded-sm"
          style={{
            height: '100%',
            animation: `pixel-bar-bounce 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes pixel-bar-bounce {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/80 border border-pink-100 p-6 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded skeleton" />
          <div className="h-3 w-16 rounded skeleton" />
        </div>
      </div>
      <div className="h-8 w-16 rounded skeleton mb-2" />
      <div className="h-3 w-20 rounded skeleton" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl">
      <div className="w-10 h-10 rounded-full skeleton" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded skeleton" />
        <div className="h-3 w-20 rounded skeleton" />
      </div>
      <div className="h-6 w-16 rounded-full skeleton" />
    </div>
  );
}
