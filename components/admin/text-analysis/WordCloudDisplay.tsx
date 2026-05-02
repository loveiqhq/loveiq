"use client";

interface WordCloudDisplayProps {
  keywords: Array<{ word: string; count: number }>;
}

export default function WordCloudDisplay({ keywords }: WordCloudDisplayProps) {
  if (keywords.length === 0) return null;

  const maxCount = Math.max(...keywords.map((k) => k.count), 1);
  const minSize = 12;
  const maxSize = 36;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-4">
      {keywords.map((kw) => {
        const size = minSize + (kw.count / maxCount) * (maxSize - minSize);
        const opacity = 0.4 + (kw.count / maxCount) * 0.6;
        return (
          <span
            key={kw.word}
            className="inline-block cursor-default text-accent-purple transition-opacity hover:opacity-100"
            style={{ fontSize: `${size}px`, opacity }}
            title={`${kw.word}: ${kw.count}`}
          >
            {kw.word}
          </span>
        );
      })}
    </div>
  );
}
