import React, { useMemo } from 'react';
import type { Page } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';
import { useAuth } from '../../hooks/useAuthContext';
import { DashboardIcon, CampaignsIcon, ContactsIcon, AccountsIcon, AnalyticsIcon, SettingsIcon, UtilitiesIcon } from '../icons/Icons';

// =============================================================================
// PERMISSION MATRIX
// =============================================================================

type AdminPageDef = { label: Page; icon: string; shortLabel: string };

const ALL_ADMIN_PAGES: AdminPageDef[] = [
    { label: 'AdminDashboard', icon: '🛡️', shortLabel: 'Admin' },
    { label: 'AdminUsers', icon: '🧑‍💻', shortLabel: 'Users' },
    { label: 'AdminErrors', icon: '⚠️', shortLabel: 'Errors' },
    { label: 'AdminAuditLog', icon: '📋', shortLabel: 'Audit' },
    { label: 'AdminSettings', icon: '⚙️', shortLabel: 'Config' },
    { label: 'AdminNotifications', icon: '🔔', shortLabel: 'Alerts' },
    { label: 'AdminLogTail', icon: '📶', shortLabel: 'Live' },
    { label: 'AdminTasks', icon: '⏰', shortLabel: 'Tasks' },
    { label: 'AdminReports', icon: '📊', shortLabel: 'Reports' },
];

const ROLE_PERMISSIONS: Record<string, Page[]> = {
    super_admin: [
        'AdminDashboard', 'AdminUsers', 'AdminErrors', 'AdminAuditLog',
        'AdminSettings', 'AdminNotifications', 'AdminLogTail', 'AdminTasks', 'AdminReports',
    ],
    admin: [
        'AdminDashboard', 'AdminUsers', 'AdminErrors', 'AdminAuditLog',
        'AdminSettings', 'AdminNotifications', 'AdminLogTail', 'AdminTasks', 'AdminReports',
    ],
    support: [
        'AdminDashboard', 'AdminUsers', 'AdminErrors',
        'AdminNotifications', 'AdminLogTail',
    ],
    auditor: [
        'AdminDashboard', 'AdminAuditLog', 'AdminErrors',
        'AdminReports', 'AdminLogTail',
    ],
    user: [],
};

// =============================================================================
// MAIN NAV ITEMS
// =============================================================================

const navItems: { label: Page; icon: React.ReactNode }[] = [
    { label: 'Dashboard', icon: <DashboardIcon className="w-7 h-7" /> },
    { label: 'Campaigns', icon: <CampaignsIcon className="w-7 h-7" /> },
    { label: 'Contacts', icon: <ContactsIcon className="w-7 h-7" /> },
    { label: 'Accounts', icon: <AccountsIcon className="w-7 h-7" /> },
    { label: 'Analytics', icon: <AnalyticsIcon className="w-7 h-7" /> },
    { label: 'Utilities', icon: <UtilitiesIcon className="w-7 h-7" /> },
    { label: 'Settings', icon: <SettingsIcon className="w-7 h-7" /> },
];

// =============================================================================
// SHARED NAV ITEM — identical styling for main + admin items
// =============================================================================

interface SharedNavItemProps {
    icon: React.ReactNode;
    label: Page;
    displayLabel?: string;
}

const SharedNavItem: React.FC<SharedNavItemProps> = ({ icon, label, displayLabel }) => {
    const { currentPage, setCurrentPage } = useAppContext();
    const isActive = currentPage === label;

    const activeClasses = 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] shadow-lg shadow-[var(--gradient-via)]/30';
    const inactiveClasses = 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:hover:text-white hover:text-gray-900 transform hover:scale-110 transition-all duration-300 ease-out';

    return (
        <li
            onClick={() => setCurrentPage(label)}
            className={`group relative flex items-center h-10 my-0.5 cursor-pointer rounded-lg ${isActive ? activeClasses : inactiveClasses}`}
        >
            <div className={`absolute left-0 top-1/4 bottom-1/4 w-1 bg-gradient-to-b from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] rounded-r-full transform scale-y-0 group-hover:scale-y-100 transition-transform duration-300 ease-out ${isActive ? 'scale-y-100' : ''}`} />
            <div className="flex items-center justify-center w-12">{icon}</div>
            <span className="whitespace-nowrap text-sm transition-opacity duration-200 opacity-100">
                {displayLabel || label}
            </span>
        </li>
    );
};

// =============================================================================
// NAVIGATION RAIL
// =============================================================================

const NavigationRail: React.FC = () => {
    const { setCurrentPage } = useAppContext();
    const { user, logout } = useAuth();

    const handleLogout = () => {
        logout();
        setCurrentPage('Login');
    };

    const displayName = user?.name || 'User';
    const displayPlan = user?.plan || 'Free Plan';
    const userRole = user?.role || 'user';

    const visibleAdminPages = useMemo(() => {
        const allowed = ROLE_PERMISSIONS[userRole] || [];
        return ALL_ADMIN_PAGES.filter(p => allowed.includes(p.label));
    }, [userRole]);

    const hasAdminAccess = visibleAdminPages.length > 0;

    return (
        <nav
            className="fixed z-20 flex flex-col h-full bg-gray-200 dark:bg-gray-800 shadow-lg"
            style={{ width: '180px' }}
        >
            {/* Logo — fixed at top */}
            <div className="flex items-center h-14 w-full px-3 shrink-0">
                <div className="flex items-center text-transparent bg-clip-text bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)] overflow-hidden">
                    <svg className="w-7 h-7 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                    </svg>
                    <span className="text-xl font-bold ml-1.5 whitespace-nowrap">NovaSend</span>
                </div>
            </div>

            {/* Scrollable middle section */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
                {/* Main nav items */}
                <ul>
                    {navItems.map(item => (
                        <SharedNavItem key={item.label} icon={item.icon} label={item.label} />
                    ))}
                </ul>

                {/* Admin section — only if user has admin role */}
                {hasAdminAccess && (
                    <>
                        <div className="mt-3 mb-1 px-2">
                            <div className="border-t border-gray-300 dark:border-gray-600 pt-2">
                                <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
                                    Admin Panel
                                </span>
                            </div>
                        </div>
                        <ul>
                            {visibleAdminPages.map(item => (
                                <SharedNavItem
                                    key={item.label}
                                    icon={<span className="text-xl">{item.icon}</span>}
                                    label={item.label}
                                    displayLabel={item.shortLabel}
                                />
                            ))}
                        </ul>
                    </>
                )}
            </div>

            {/* User profile + logout — single row, profile left, logout right */}
            <div className="shrink-0 border-t border-gray-300 dark:border-gray-600">
                <div className="flex items-center h-12 px-3">
                    {/* Profile info — left side */}
                    <div className="flex items-center min-w-0 flex-1 text-gray-500 dark:text-gray-400 cursor-default">
                        <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 bg-cover bg-center shrink-0" style={{ backgroundImage: `url(https://picsum.photos/100)` }} />
                        <div className="flex flex-col min-w-0 ml-2">
                            <span className="font-semibold text-xs text-gray-800 dark:text-gray-200 truncate">{displayName}</span>
                            <span className="text-[10px] truncate">{displayPlan}</span>
                        </div>
                    </div>
                    {/* Logout button — right side */}
                    <button
                        onClick={handleLogout}
                        title="Logout"
                        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-200"
                    >
                        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default NavigationRail;