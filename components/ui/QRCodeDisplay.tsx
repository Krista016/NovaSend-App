import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import Button from './Button';
import { accountApi } from '../../services/api';

interface QRCodeDisplayProps {
    accountId: string;
    onClose: () => void;
}

type QRStatus = 'loading' | 'ready' | 'connected' | 'error';

const POLL_INTERVAL_MS = 3000;
const QR_RETRY_INTERVAL_MS = 2000;
const SUCCESS_DELAY_MS = 2000;
const TIMEOUT_MS = 120000; // 2 minutes

function getToken(): string | null {
    return localStorage.getItem('novasend_token');
}

const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ accountId, onClose }) => {
    const [status, setStatus] = useState<QRStatus>('loading');
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    const mountedRef = useRef<boolean>(true);
    const statusRef = useRef<QRStatus>('loading');
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep statusRef in sync for timeout callback closure
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    // ---- Status polling ----

    const stopStatusPolling = (): void => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const checkStatus = async (): Promise<void> => {
        try {
            const token = getToken();
            const response = await fetch(`/api/accounts/${accountId}/status`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            if (!mountedRef.current) return;

            if (!response.ok) {
                console.warn('Status check failed:', response.status);
                return;
            }

            const data = await response.json();
            if (!mountedRef.current) return;

            if (data.account_status === 'Connected' || data.is_connected) {
                stopStatusPolling();
                setStatus('connected');
                successTimerRef.current = setTimeout(() => {
                    if (mountedRef.current) {
                        onClose();
                    }
                }, SUCCESS_DELAY_MS);
            }
        } catch (err) {
            // Silently ignore polling errors; will retry on next interval
            console.warn('Status poll error:', err);
        }
    };

    const startStatusPolling = (): void => {
        stopStatusPolling();
        checkStatus(); // Immediate first check
        pollingRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    };

    // ---- QR image fetching ----

    const fetchQRImage = async (): Promise<void> => {
        try {
            // Check if local agent on port 5001 is online
            try {
                const agentStatusRes = await fetch('http://127.0.0.1:5001/status');
                if (agentStatusRes.ok) {
                    const agentData = await agentStatusRes.json();
                    if (agentData.agent_status === 'Online' || agentData.agent_status === 'Busy') {
                        // Local agent is active! Since it handles the headed browser directly,
                        // we skip loading the QR image in this modal and start polling status.
                        setStatus('ready');
                        startStatusPolling();
                        return;
                    }
                }
            } catch (_) {
                // Local agent offline, fall through to backend QR image generation
            }

            const token = getToken();
            const qrEndpoint = accountApi.getQR(accountId);
            const response = await fetch(qrEndpoint, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!mountedRef.current) return;

            if (response.status === 404) {
                // QR not ready yet; retry after delay
                qrRetryRef.current = setTimeout(fetchQRImage, QR_RETRY_INTERVAL_MS);
                return;
            }

            if (!response.ok) {
                throw new Error(`Failed to load QR code (HTTP ${response.status})`);
            }

            const contentType = response.headers.get('Content-Type') || '';
            if (!contentType.startsWith('image/')) {
                // May be a JSON error body
                const data = await response.json().catch(() => null);
                throw new Error(data?.message || 'Unexpected response from QR endpoint');
            }

            const blob = await response.blob();
            if (!mountedRef.current) return;

            // Revoke previous object URL if any
            if (qrUrl) {
                URL.revokeObjectURL(qrUrl);
            }

            const url = URL.createObjectURL(blob);
            setQrUrl(url);
            setStatus('ready');
            startStatusPolling();
        } catch (err: any) {
            if (!mountedRef.current) return;
            setErrorMessage(err.message || 'Failed to load QR code');
            setStatus('error');
        }
    };

    // ---- Retry ----

    const handleRetry = (): void => {
        setStatus('loading');
        setErrorMessage('');
        if (qrUrl) {
            URL.revokeObjectURL(qrUrl);
            setQrUrl(null);
        }
        stopStatusPolling();
        fetchQRImage();

        // Reset timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            if (mountedRef.current && statusRef.current !== 'connected') {
                setErrorMessage('QR code scanning timed out. Please try again.');
                setStatus('error');
            }
        }, TIMEOUT_MS);
    };

    // ---- Cleanup ----

    const cleanupAll = (): void => {
        mountedRef.current = false;
        stopStatusPolling();
        if (qrRetryRef.current) {
            clearTimeout(qrRetryRef.current);
            qrRetryRef.current = null;
        }
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    // ---- Mount / unmount ----

    useEffect(() => {
        mountedRef.current = true;

        fetchQRImage();

        timeoutRef.current = setTimeout(() => {
            if (mountedRef.current && statusRef.current !== 'connected') {
                setErrorMessage('QR code scanning timed out. Please try again.');
                setStatus('error');
            }
        }, TIMEOUT_MS);

        return cleanupAll;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId]);

    // Revoke object URL when qrUrl changes or component unmounts
    useEffect(() => {
        return () => {
            if (qrUrl) {
                URL.revokeObjectURL(qrUrl);
            }
        };
    }, [qrUrl]);

    // ---- Render helpers ----

    const renderLoading = () => (
        <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-[var(--gradient-via)] mx-auto mb-6" />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Generating QR Code...
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Please wait while we prepare your WhatsApp Web link.
            </p>
        </div>
    );

    const renderReady = () => {
        const isLocalAgent = !qrUrl;
        return (
            <div className="text-center">
                {qrUrl ? (
                    <div className="bg-white p-3 rounded-xl inline-block shadow-inner mb-4">
                        <img
                            src={qrUrl}
                            alt="WhatsApp QR Code"
                            className="w-56 h-56 rounded-lg"
                        />
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-[var(--gradient-via)] mx-auto mb-4" />
                        <p className="text-sm font-semibold text-[var(--gradient-via)] animate-pulse">
                            Standard Browser Active
                        </p>
                    </div>
                )}
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mt-2">
                    Scan with WhatsApp
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                    {isLocalAgent ? (
                        <span>
                            Please scan the QR code displayed in the <strong>opened browser window</strong> on your desktop.
                        </span>
                    ) : (
                        <span>
                            Open WhatsApp on your phone, go to{' '}
                            <strong>Settings {'>'} Linked Devices</strong>, and scan this QR code.
                        </span>
                    )}
                </p>
                <div className="mt-6">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </div>
        );
    };

    const renderConnected = () => (
        <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Connection Successful!
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Your WhatsApp account is now connected and ready to use.
            </p>
        </div>
    );

    const renderError = () => (
        <div className="text-center py-8">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Connection Failed
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xs mx-auto">
                {errorMessage || 'An unexpected error occurred. Please try again.'}
            </p>
            <div className="mt-6 flex justify-center space-x-3">
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
                <Button variant="primary" onClick={handleRetry}>
                    Retry
                </Button>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (status) {
            case 'loading':
                return renderLoading();
            case 'ready':
                return renderReady();
            case 'connected':
                return renderConnected();
            case 'error':
                return renderError();
            default:
                return null;
        }
    };

    // Allow backdrop click to close only in ready/error states (not during loading or connected auto-close)
    const allowBackdropClose = status === 'ready' || status === 'error';

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={allowBackdropClose ? onClose : undefined}
        >
            <Card
                className="w-full max-w-sm transform transition-all"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
                {renderContent()}
            </Card>
        </div>
    );
};

export default QRCodeDisplay;