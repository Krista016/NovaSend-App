import React, { useState, useEffect } from 'react';
import Button from './Button';

interface ReconnectModalProps {
    accountName: string;
    onClose: () => void;
    onSuccess: () => void;
}

const ReconnectModal: React.FC<ReconnectModalProps> = ({ accountName, onClose, onSuccess }) => {
    const [status, setStatus] = useState<'generating' | 'waiting' | 'connected' | 'error'>('generating');

    useEffect(() => {
        const timer1 = setTimeout(() => setStatus('waiting'), 1500);
        const timer2 = setTimeout(() => {
            setStatus('connected');
            setTimeout(() => {
                onSuccess();
            }, 1200);
        }, 7000);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
        };
    }, [onSuccess]);

    const renderContent = () => {
        switch (status) {
            case 'generating':
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-[var(--gradient-via)] mx-auto mb-4"></div>
                        <h3 className="text-lg font-semibold">Generating QR Code...</h3>
                        <p className="text-gray-500 dark:text-gray-400">Please wait a moment.</p>
                    </div>
                );
            case 'waiting':
                return (
                    <div className="text-center">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=NovaSendReconnect" alt="QR Code" className="mx-auto rounded-lg bg-white p-2" />
                        <h3 className="text-lg font-semibold mt-4">Scan to Reconnect</h3>
                        <p className="text-gray-500 dark:text-gray-400">Open WhatsApp on your phone and link this device.</p>
                    </div>
                );
            case 'connected':
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                           <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                           </svg>
                        </div>
                        <h3 className="text-lg font-semibold">Connection Successful!</h3>
                        <p className="text-gray-500 dark:text-gray-400">The account '{accountName}' is now connected.</p>
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={status !== 'generating' ? onClose : undefined}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm transform transition-all p-8" onClick={(e) => e.stopPropagation()}>
                {renderContent()}
                 {status === 'waiting' && (
                    <div className="mt-6 text-center">
                         <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    </div>
                 )}
            </div>
        </div>
    );
};

export default ReconnectModal;
