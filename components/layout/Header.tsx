
import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import { ChevronDownIcon, AccountsIcon } from '../icons/Icons';
import ThemeToggle from '../ui/ThemeToggle';
import GlobalSearch from '../ui/GlobalSearch';
import { AgentStatus } from '../../types';

const AgentStatusIndicator: React.FC = () => {
    const { agentStatus } = useAppContext();
    const isOnline = agentStatus === 'Online' || agentStatus === 'Busy';

    const statusConfig = {
        Online: { text: 'Online', color: 'text-green-400', dot: 'bg-green-500' },
        Busy: { text: 'Busy', color: 'text-green-400', dot: 'bg-green-500' },
        Offline: { text: 'Offline', color: 'text-red-400', dot: 'bg-red-500' },
    };
    
    const currentStatus = statusConfig[agentStatus];

    return (
        <div className="flex items-center space-x-2 h-10 px-3 rounded-lg bg-gray-200/50 dark:bg-gray-800">
            <div className="relative flex items-center justify-center w-3 h-3">
                {isOnline && <div className={`absolute w-full h-full rounded-full ${currentStatus.dot} opacity-75 animate-ping`}></div>}
                <div className={`relative w-2 h-2 rounded-full ${currentStatus.dot}`}></div>
            </div>
            <span className={`font-semibold text-sm ${currentStatus.color}`}>{`Agent: ${currentStatus.text}`}</span>
        </div>
    );
}

const Header: React.FC = () => {
    const { currentPage, accounts, selectedAccountId, setSelectedAccountId, setIsAddAccountModalOpen } = useAppContext();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

    const handleAddAccountClick = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsAddAccountModalOpen(true);
        setIsDropdownOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    return (
        <header className="relative z-30 bg-gray-100 dark:bg-gray-900 h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-6 lg:p-8 border-b border-gray-200 dark:border-gray-700/50">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200 hidden md:block">{currentPage}</h1>
            <div className="flex items-center space-x-4">
                <AgentStatusIndicator />
                <GlobalSearch />
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center space-x-2 h-10 px-3 rounded-lg bg-gray-200/50 dark:bg-gray-800 hover:bg-gray-300/50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                        {selectedAccount ? (
                            <>
                                <div className={`w-2 h-2 rounded-full ${selectedAccount.status === 'Connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <span className="font-semibold text-sm">{selectedAccount.name}</span>
                            </>
                        ) : (
                            <span className="font-semibold text-sm text-gray-400">No Account</span>
                        )}
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isDropdownOpen && (
                        <div className="absolute left-1/2 transform -translate-x-1/2 mt-2 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-10 border border-gray-200 dark:border-gray-700">
                            <div className="p-1">
                                {accounts.map(account => (
                                    <a
                                        key={account.id}
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setSelectedAccountId(account.id);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                                    >
                                        <div className={`w-2 h-2 rounded-full ${account.status === 'Connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                        <span>{account.name}</span>
                                    </a>
                                ))}
                            </div>
                            <div className="border-t border-gray-200 dark:border-gray-700"></div>
                             <div className="p-2">
                                <a
                                    href="#"
                                    onClick={handleAddAccountClick}
                                    className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] hover:shadow-lg hover:shadow-[var(--gradient-via)]/30 rounded-md transition-all duration-300"
                                >
                                    <AccountsIcon className="w-4 h-4 text-white" />
                                    <span>Add New Account</span>
                                </a>
                            </div>
                        </div>
                    )}
                </div>
                <ThemeToggle />
            </div>
        </header>
    );
};

export default Header;
