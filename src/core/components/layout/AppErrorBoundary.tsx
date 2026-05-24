import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
}

/**
 * Catches any uncaught render-time error in the app shell so the user sees a
 * readable message instead of a white screen. Includes a "Reload" button and
 * dumps stack + component trace for copy/paste back to support.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[AppErrorBoundary] uncaught render error:', error, info);
    this.setState({ hasError: true, error, info });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { error, info } = this.state;
    return (
      <div className="min-h-screen w-screen flex items-start justify-center bg-gray-50 p-6 overflow-auto">
        <div className="max-w-3xl w-full bg-white border border-red-200 shadow-lg p-6 rounded">
          <h1 className="text-xl font-bold text-red-700 mb-2">Something went wrong.</h1>
          <p className="text-sm text-gray-700 mb-4">
            The app hit an uncaught error and stopped rendering. Reload to retry, or copy the
            details below so we can pin down what broke.
          </p>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Message</div>
              <pre className="bg-red-50 text-red-800 text-xs p-3 border border-red-100 whitespace-pre-wrap break-words">
                {error?.message || String(error)}
              </pre>
            </div>
            {error?.stack && (
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-600 font-semibold uppercase">Stack</summary>
                <pre className="bg-gray-50 text-gray-700 p-3 border border-gray-200 whitespace-pre-wrap break-words mt-2">
                  {error.stack}
                </pre>
              </details>
            )}
            {info?.componentStack && (
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-600 font-semibold uppercase">Component tree</summary>
                <pre className="bg-gray-50 text-gray-700 p-3 border border-gray-200 whitespace-pre-wrap break-words mt-2">
                  {info.componentStack}
                </pre>
              </details>
            )}
          </div>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Reload app
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
