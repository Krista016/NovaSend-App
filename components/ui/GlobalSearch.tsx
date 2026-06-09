


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../../hooks/useAppContext';
import { SearchIcon, CampaignsIcon, ContactsIcon, AccountsIcon, BoltIcon } from '../icons/Icons';
import { Campaign, Contact, Account, CampaignStatus, Page } from '../../types';

interface ActionSearchResult {
    id: string;
    keywords: string[];
    title: string;
    subtitle: string;
    page: Page;
    elementId?: string;
}

const searchableActions: ActionSearchResult[] = [
    { id: 'action-download-report', keywords: ['download', 'report', 'export', 'excel', 'analytics'], title: 'Download Analytics Report', subtitle: 'Export data to .xlsx file', page: 'Analytics', elementId: 'download-report-btn' },
    { id: 'action-new-campaign', keywords: ['new', 'create', 'campaign', 'launch'], title: 'Create New Campaign', subtitle: 'Start a new messaging campaign', page: 'Campaigns' },
    { id: 'action-import-contacts', keywords: ['import', 'upload', 'add', 'contacts'], title: 'Import Contacts', subtitle: 'Bulk upload contacts from a file', page: 'Contacts' },
    { id: 'action-add-account', keywords: ['add', 'new', 'account', 'connect'], title: 'Connect New Account', subtitle: 'Link a new WhatsApp account', page: 'Accounts' },
];

type SearchResult = 
    | { type: 'campaign'; item: Campaign }
    | { type: 'contact'; item: Contact }
    | { type: 'account'; item: Account }
    | { type: 'action'; item: ActionSearchResult };

const GlobalSearch: React.FC = () => {
    const { campaigns, accounts, contacts, setCurrentPage } = useAppContext();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);
    const resultsRef = useRef<(HTMLLIElement | null)[]>([]);

    const flatResults: SearchResult[] = useMemo(() => {
        if (searchTerm.length < 2) return [];
        
        const lowerCaseTerm = searchTerm.toLowerCase();
        
        const filteredCampaigns = campaigns
            .filter(c => c.name.toLowerCase().includes(lowerCaseTerm))
            .slice(0, 3)
            .map(item => ({ type: 'campaign' as const, item }));
            
        const filteredContacts = contacts
            .filter(c => 
                c.number.includes(lowerCaseTerm) || 
                c.firstName?.toLowerCase().includes(lowerCaseTerm) ||
                c.lastName?.toLowerCase().includes(lowerCaseTerm)
            )
            .slice(0, 3)
            .map(item => ({ type: 'contact' as const, item }));

        const filteredAccounts = accounts
            .filter(a => a.name.toLowerCase().includes(lowerCaseTerm))
            .slice(0, 3)
            .map(item => ({ type: 'account' as const, item }));

        const filteredActions = searchableActions
            .filter(a => a.keywords.some(k => k.toLowerCase().includes(lowerCaseTerm)))
            .map(item => ({ type: 'action' as const, item }));

        return [...filteredCampaigns, ...filteredContacts, ...filteredAccounts, ...filteredActions];
    }, [searchTerm, campaigns, contacts, accounts]);
    
    const hasResults = flatResults.length > 0;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isFocused) {
            setActiveIndex(-1);
        }
    }, [searchTerm, isFocused]);
    
    useEffect(() => {
        resultsRef.current[activeIndex]?.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
        });
    }, [activeIndex]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < flatResults.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === 'Enter' && activeIndex > -1) {
            e.preventDefault();
            handleResultClick(flatResults[activeIndex]);
        } else if (e.key === 'Escape') {
            setIsFocused(false);
        }
    };
    
    const handleResultClick = (result: SearchResult) => {
        switch(result.type) {
            case 'campaign': setCurrentPage('Campaigns'); break;
            case 'contact': setCurrentPage('Contacts'); break;
            case 'account': setCurrentPage('Accounts'); break;
            case 'action':
                setCurrentPage(result.item.page);
                if (result.item.elementId) {
                    // Timeout to allow page to render before scrolling
                    setTimeout(() => {
                        const element = document.getElementById(result.item.elementId!);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.classList.add('ring-2', 'ring-offset-2', 'ring-[var(--gradient-via)]', 'transition-shadow', 'duration-1000', 'ease-out');
                            setTimeout(() => element.classList.remove('ring-2', 'ring-offset-2', 'ring-[var(--gradient-via)]'), 2000);
                        }
                    }, 100);
                }
                break;
        }
        setSearchTerm('');
        setIsFocused(false);
    };
    
    const getStatusBadge = (status: CampaignStatus | Account['status'] | Contact['status']) => {
        const base = 'px-1.5 py-0.5 text-xs font-semibold rounded-full ';
        switch(status) {
            case CampaignStatus.RUNNING: return base + 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
            case CampaignStatus.COMPLETED: return base + 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
            case CampaignStatus.SCHEDULED: return base + 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
            case 'Connected': return base + 'text-green-500';
            case 'Active': return base + 'text-green-500';
            default: return 'text-gray-500';
        }
    }

    const renderResult = (result: SearchResult, index: number) => {
        const isActive = index === activeIndex;
        let icon, title, subtitle;

        switch(result.type) {
            case 'campaign':
                icon = <CampaignsIcon className="w-4 h-4 text-gray-500" />;
                title = result.item.name;
                subtitle = <span className={getStatusBadge(result.item.status)}>{result.item.status}</span>;
                break;
            case 'contact':
                icon = <ContactsIcon className="w-4 h-4 text-gray-500" />;
                title = `${result.item.firstName || ''} ${result.item.lastName || ''}`.trim() || 'Unknown';
                subtitle = <span className="font-mono text-xs">{result.item.number}</span>;
                break;
            case 'account':
                icon = <AccountsIcon className="w-4 h-4 text-gray-500" />;
                title = result.item.name;
                subtitle = <span className={getStatusBadge(result.item.status)}>{result.item.status}</span>;
                break;
            case 'action':
                icon = <BoltIcon className="w-4 h-4 text-gray-500" />;
                title = result.item.title;
                subtitle = <span>{result.item.subtitle}</span>;
                break;
        }

        return (
            <li 
                key={`${result.type}-${result.item.id}`}
                ref={el => { resultsRef.current[index] = el; }}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`px-4 py-2 cursor-pointer flex items-center space-x-3 rounded-md mx-1 my-0.5 transition-colors ${isActive ? 'bg-gradient-to-r from-[var(--gradient-from)]/20 via-[var(--gradient-via)]/20 to-[var(--gradient-to)]/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
            >
                {icon}
                <div className="flex-grow">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{title}</p>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>
                </div>
            </li>
        )
    };

    return (
        <div className="relative w-64" ref={searchRef}>
            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="Global Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onKeyDown={handleKeyDown}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-200/50 dark:bg-gray-800 border border-transparent dark:hover:border-gray-700 focus:border-[var(--gradient-via)] focus:ring-[var(--gradient-via)] rounded-lg transition"
                />
            </div>
            {isFocused && searchTerm.length > 1 && (
                 <div className="absolute top-full mt-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {hasResults ? (
                        <ul className="max-h-96 overflow-y-auto p-1">
                           {flatResults.map(renderResult)}
                        </ul>
                    ) : (
                        <div className="p-4 text-sm text-center text-gray-500">No results found for "{searchTerm}"</div>
                    )}
                 </div>
            )}
        </div>
    );
};

export default GlobalSearch;