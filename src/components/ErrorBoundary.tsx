import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export default function ErrorBoundary({ children }: Props) {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("An unexpected error occurred.");

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      try {
        const parsed = JSON.parse(event.error?.message || "");
        if (parsed.error && parsed.operationType) {
          setErrorMessage(`Firestore ${parsed.operationType} failed: ${parsed.error}`);
        }
      } catch (e) {
        // Not a FirestoreErrorInfo JSON
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">System Error</h1>
        <p className="text-slate-400 max-w-md mb-8">
          {errorMessage}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Application
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
