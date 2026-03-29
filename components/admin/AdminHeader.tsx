"use client";

import PresenceIndicator from "./PresenceIndicator";

interface AdminHeaderProps {
  title: string;
  onMenuToggle: () => void;
}

export default function AdminHeader({ title, onMenuToggle }: AdminHeaderProps) {
  return (
    <header className="flex h-16 items-center gap-4 border-b border-white/10 px-4 lg:px-6">
      <button
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-text-muted hover:bg-white/5 hover:text-text-primary lg:hidden"
        aria-label="Toggle menu"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 className="font-serif text-lg font-semibold text-text-primary">{title}</h1>
      <div className="ml-auto">
        <PresenceIndicator />
      </div>
    </header>
  );
}
