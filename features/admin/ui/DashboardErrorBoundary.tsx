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
        className="rounded-[20px] border border-ap-bad/25 bg-white p-5 text-sm text-ap-bad-ink shadow-ap"
        role="alert"
      >
        <p className="font-bold">{this.props.label} could not be displayed.</p>
        <p className="mt-2 break-words font-mono text-xs text-ap-body">
          {error.name}: {error.message}
        </p>
        {digest && <p className="mt-1 font-mono text-xs text-ap-muted">digest: {digest}</p>}
        <p className="mt-3 text-xs text-ap-muted">
          The rest of AP-Analytics still works — the sidebar links are unaffected. Please send this
          message on so it can be fixed.
        </p>
      </div>
    );
  }
}
