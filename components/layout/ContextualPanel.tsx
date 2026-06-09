
import React, { useState } from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import NotificationComponent from '../ui/Notification';
import { InfoIcon } from '../icons/Icons';
import { SystemLogEntry as SystemLogEntryType } from '../../types';

const LogEntry: React.FC<{ log: SystemLogEntryType }> = ({ log }) => {
    const { message, timestamp, level } = log;
    
    const levelColor = {
        INFO: 'text-green-400',
        WARN: 'text-yellow-400',
        ERROR: 'text-red-400',
        DEFAULT: 'text-gray-400',
    };
    
    const colorClass = levelColor[level as keyof typeof levelColor] || levelColor.DEFAULT;

    return (
        <div className="text-sm mb-3 font-mono">
            <div className="flex justify-between items-baseline">
                <span className={`font-bold ${colorClass}`}>{level}</span>
                <time className="text-xs text-gray-500">{timestamp}</time>
            </div>
            <p className="text-gray-300 whitespace-pre-wrap break-words">{message}</p>
        </div>
    );
};


const ContextualPanel: React.FC = () => {
    const { notification, systemLogs, agentStatus, accounts, selectedAccountId } = useAppContext();
    const [isNovaGuardTooltipVisible, setIsNovaGuardTooltipVisible] = useState(false);
    const isNovaGuardActive = agentStatus === 'Online' || agentStatus === 'Busy';
    const selectedAccount = accounts.find(a => a.id === selectedAccountId);

    return (
        <aside className="w-80 bg-gray-200/50 dark:bg-black/20 hidden lg:flex flex-col border-l border-gray-200 dark:border-gray-700/50 relative">
            <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700/50 shrink-0">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Live Logs</h2>
            </div>
            
            <div className="absolute top-16 left-0 right-0 p-4 z-10 pointer-events-none">
                <div className="pointer-events-auto">
                    <NotificationComponent notification={notification} />
                </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto flex flex-col-reverse">
                {systemLogs.length > 0 ? (
                    [...systemLogs].reverse().map((log, index) => (
                        <LogEntry key={`${log.timestamp}-${index}`} log={log} />
                    ))
                ) : (
                    <div className="text-center text-sm text-gray-500 mt-8">
                        <p>No activity yet.</p>
                        <p>Start a campaign to see live agent logs.</p>
                    </div>
                )}
            </div>
             <div className="p-4 border-t border-gray-200 dark:border-gray-700/50">
                <h3 className="text-md font-semibold mb-2 text-gray-800 dark:text-gray-200">Status</h3>
                <div className="text-sm space-y-2">
                    <div className="relative">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-1">
                                <span className="text-gray-500 dark:text-gray-400">NovaGuard:</span>
                                 <button 
                                    className="flex items-center"
                                    onMouseEnter={() => setIsNovaGuardTooltipVisible(true)}
                                    onMouseLeave={() => setIsNovaGuardTooltipVisible(false)}
                                    aria-describedby="novaguard-tooltip"
                                >
                                    <InfoIcon className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition" />
                                </button>
                            </div>
                            <span className={isNovaGuardActive ? "text-green-500 font-semibold" : "text-red-500 font-semibold"}>
                                    {isNovaGuardActive ? 'Active (Secured)' : 'Inactive (Unsecured)'}
                                </span>
                            {isNovaGuardTooltipVisible && (
                                <div id="novaguard-tooltip" role="tooltip" className="absolute bottom-full left-0 mb-2 w-full max-w-xs p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10 transition-opacity duration-300">
                                    <h4 className="font-bold mb-1 text-base text-transparent bg-clip-text bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]">NovaGuard Anti-Blocking Engine</h4>
                                    <p className="text-gray-300">Simulates human-like sending by adding dynamic delays, including its ability to mimic typing actions, varying message content with spintax, and managing send speed to protect your account.</p>
                                    <p className="mt-2 text-gray-400">Keeping this active is highly recommended to reduce blocking risk.</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Selected Account:</span>
                        <span className="text-gray-700 dark:text-gray-300 font-semibold">{selectedAccount?.name || 'None'}</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default ContextualPanel;