import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Optional fallback UI to show instead of the default error card */
    fallback?: ReactNode;
    /** Called when the user clicks retry */
    onRetry?: () => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * React Error Boundary that catches render errors and displays
 * a user-friendly fallback instead of a blank screen.
 *
 * Critical for a public safety app — users must never see a white
 * screen during a flood event.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        this.props.onRetry?.();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
        }

        return this.props.children;
    }
}

/**
 * Default error fallback UI with retry button.
 * Designed to be helpful without being alarming.
 */
export function ErrorFallback({
    error,
    onRetry,
}: {
    error: Error | null;
    onRetry?: () => void;
}) {
    return (
        <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-4">
                <div className="text-4xl">⚠️</div>
                <h2 className="text-lg font-semibold text-foreground">
                    Something went wrong
                </h2>
                <p className="text-sm text-muted-foreground">
                    The app encountered an error. This might be a temporary network issue.
                </p>
                {error?.message && (
                    <p className="text-xs text-muted-foreground/70 bg-muted rounded-md p-2 font-mono break-all">
                        {error.message}
                    </p>
                )}
                <div className="flex flex-col gap-2 pt-2">
                    {onRetry && (
                        <Button onClick={onRetry} variant="default" className="w-full">
                            Try Again
                        </Button>
                    )}
                    <Button
                        onClick={() => window.location.reload()}
                        variant="outline"
                        className="w-full"
                    >
                        Reload Page
                    </Button>
                </div>
            </div>
        </div>
    );
}
