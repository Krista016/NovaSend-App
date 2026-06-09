import React, { useState } from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Account } from '../../types';
import QRCodeDisplay from '../ui/QRCodeDisplay';
import { accountApi } from '../../services/api';
import { BoltIcon } from '../icons/Icons';

const Accounts: React.FC = () => {
    const { accounts, setAccounts, setIsAddAccountModalOpen, setCurrentPage } = useAppContext();
    const [qrAccountId, setQrAccountId] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [diagnostics, setDiagnostics] = useState<Record<string, any>>({});

    React.useEffect(() => {
        const fetchAllDiagnostics = async () => {
            const newDiagnostics: Record<string, any> = {};
            for (const acc of accounts) {
                try {
                    const res = await accountApi.getDiagnostics(acc.id);
                    if (res && res.status === 'success' && res.diagnostics) {
                        newDiagnostics[acc.id] = res.diagnostics;
                    }
                } catch (err) {
                    console.error(`Failed to fetch diagnostics for ${acc.id}:`, err);
                }
            }
            setDiagnostics(newDiagnostics);
        };

        if (accounts.length > 0) {
            fetchAllDiagnostics();
            const interval = setInterval(fetchAllDiagnostics, 5000);
            return () => clearInterval(interval);
        }
    }, [accounts]);

    const handleRemoveAccount = (accountId: string) => {
        if (window.confirm("Are you sure you want to remove this account? This action cannot be undone.")) {
            setAccounts(prev => prev.filter(acc => acc.id !== accountId));
        }
    };

    const handleConnectQR = async (account: Account) => {
        setIsConnecting(true);
        try {
            await accountApi.connect(account.id);
            setQrAccountId(account.id);
        } catch (err) {
            console.error('Failed to initiate connection:', err);
            alert('Failed to start QR connection. Please try again.');
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <>
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Manage Accounts</h2>
                    <Button variant="primary" onClick={() => setIsAddAccountModalOpen(true)}>Add New Account</Button>
                </div>
                
                <Card>
                    <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] flex items-center justify-center">
                            <BoltIcon className="w-6 h-6 text-white"/>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">How Agent Automation Works</h3>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">NovaSend uses a local agent for 100% automated, human-like sending.</p>
                            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                <li><strong>Run the Agent:</strong> First, set up and run the local agent from the <button onClick={() => setCurrentPage('Settings')} className="text-[var(--gradient-via)] hover:underline font-semibold">Settings</button> page.</li>
                                <li><strong>Log in to WhatsApp:</strong> The agent will open a Chrome window. Scan the QR code to log into WhatsApp Web.</li>
                                <li><strong>Launch a Campaign:</strong> Once you launch a campaign, the agent will take over and send all messages automatically. You can watch the progress in real-time.</li>
                            </ol>
                        </div>
                    </div>
                </Card>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {accounts.map(account => (
                        <Card key={account.id} className="flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start">
                                    <h3 className="text-xl font-semibold">{account.name}</h3>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${account.status === 'Connected' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'}`}>
                                        {account.status}
                                    </span>
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 mt-2">ID: {account.id}</p>
                                
                                {/* Diagnostics Grid */}
                                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                                        <div className="text-gray-400 dark:text-gray-500 font-medium font-semibold">Sent</div>
                                        <div className="text-sm font-bold text-green-600 dark:text-green-400 mt-0.5">
                                            {diagnostics[account.id]?.successful_sends ?? account.successful_sends ?? 0}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                                        <div className="text-gray-400 dark:text-gray-500 font-medium font-semibold">Failed</div>
                                        <div className="text-sm font-bold text-red-600 dark:text-red-400 mt-0.5">
                                            {diagnostics[account.id]?.failed_sends ?? account.failed_sends ?? 0}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                                        <div className="text-gray-400 dark:text-gray-500 font-medium font-semibold">Resets</div>
                                        <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                                            {diagnostics[account.id]?.session_resets ?? account.session_resets ?? 0}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                                        <div className="text-gray-400 dark:text-gray-500 font-medium font-semibold">Crashes</div>
                                        <div className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                                            {diagnostics[account.id]?.browser_crashes ?? account.browser_crashes ?? 0}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex space-x-2">
                                 {account.status === 'Disconnected' && (
                                     <Button 
                                         variant="secondary" 
                                         className="w-full" 
                                         onClick={() => handleConnectQR(account)}
                                         disabled={isConnecting}
                                     >
                                         {isConnecting ? 'Connecting...' : 'Connect via QR'}
                                     </Button>
                                 )}
                                 <Button 
                                    variant="secondary" 
                                    className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:bg-red-500/10 dark:hover:bg-red-500/20"
                                    onClick={() => handleRemoveAccount(account.id)}
                                >
                                    Remove
                                </Button>
                            </div>
                        </Card>
                    ))}
                     <Card className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 text-center hover:border-[var(--gradient-via)] transition-colors cursor-pointer" onClick={() => setIsAddAccountModalOpen(true)}>
                        <h3 className="text-xl font-semibold text-gray-500 dark:text-gray-400">Add a new Account</h3>
                        <p className="text-gray-400 dark:text-gray-500 mt-2">Expand your reach by connecting another WhatsApp number.</p>
                        <Button variant="primary" className="mt-4 pointer-events-none">Add Account</Button>
                    </Card>
                </div>
            </div>
            {qrAccountId && (
                <QRCodeDisplay 
                    accountId={qrAccountId}
                    onClose={() => {
                        setQrAccountId(null);
                        accountApi.list().then(data => {
                            if (data.accounts) {
                                setAccounts(data.accounts.map((a: any) => ({
                                    id: String(a.id),
                                    name: a.name,
                                    status: a.status as 'Connected' | 'Disconnected',
                                })));
                            }
                        }).catch(() => {});
                    }}
                />
            )}
        </>
    );
};

export default Accounts;
