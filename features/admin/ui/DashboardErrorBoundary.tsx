"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Scoped error boundary for a data-driven admin panel.
 *
 * Without this, one throw inside a dashboard hits the app-wide boundary and the
 * whole page becomes "Something went wrong" — which is indistinguishable from
 * being logged out, and tells whoever is looking at it nothing. That happened on
 * /admin: the server returned 200 and the API returned 200, but a client-side
 * throw blanked the page with no recoverable detail.
 *
 * This keeps the failure contained to the panel that failed AND shows the actual
 * message and digest, so the next report comes with the error attached instead of
 * a screenshot of a shrug.
 */
interface Props {
  children: ReactNode;
  label: string;
}

interface State {
  error: Error | null;
}

export default class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the browser console too, for anyone with devtools open.
    console.error(`[${this.props.label}] render failed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const digest = (error as Error & { digest?: string }).digest;
    return (
      <div
        className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300"
        role="alert"
      >
        <p className="font-medium">{this.props.label} could not be displayed.</p>
        <p className="mt-2 break-words font-mono text-xs text-red-200/90">
          {error.name}: {error.message}
        </p>
        {digest && <p className="mt-1 font-mono text-xs text-red-200/70">digest: {digest}</p>}
        <p className="mt-3 text-xs text-red-200/70">
          The rest of the admin panel still works — the sidebar links are unaffected. Please send
          this message on so it can be fixed.
        </p>
      </div>
    );
  }
}
