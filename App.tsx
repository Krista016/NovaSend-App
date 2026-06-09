import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Page, AppContextType, Theme, GradientPalette, Account, Campaign, CampaignStatus, Notification, SystemLogEntry, CampaignLogEntry, Contact, GlobalPlaceholder, AgentStatus, CampaignTemplate, Group } from './types';
import { AppContext } from './hooks/useAppContext';
import NavigationRail from './components/layout/NavigationRail';
import ContextualPanel from './components/layout/ContextualPanel';
import Header from './components/layout/Header';
import Dashboard from './components/pages/Dashboard';
import Campaigns from './components/pages/Campaigns';
import Analytics from './components/pages/Analytics';
import Accounts from './components/pages/Accounts';
import Contacts from './components/pages/Contacts';
import Settings from './components/pages/Settings';
import Utilities from './components/pages/Utilities';
import CampaignEditorModal from './components/ui/CampaignEditorModal';
import AddAccountModal from './components/ui/AddAccountModal';
import { AuthProvider, useAuth } from './hooks/useAuthContext';
import LoginPage from './components/pages/LoginPage';
import SignupPage from './components/pages/SignupPage';
import { agentApi, campaignApi, accountApi, contactApi, groupApi, userSettingsApi } from './services/api';
import AdminDashboard from './components/pages/AdminDashboard';
import AdminUsers from './components/pages/AdminUsers';
import AdminErrors from './components/pages/AdminErrors';
import AdminAuditLog from './components/pages/AdminAuditLog';
import AdminSettings from './components/pages/AdminSettings';
import AdminNotifications from './components/pages/AdminNotifications';
import AdminLogTail from './components/pages/AdminLogTail';
import AdminTasks from './components/pages/AdminTasks';
import AdminReports from './components/pages/AdminReports';

const gradients = {
    nova: { name: 'Nova Default', from: '#3b82f6', via: '#8b5cf6', to: '#14b8a6' },
    sunset: { name: 'Cyberpunk Sunset', from: '#ec4899', via: '#f97316', to: '#8b5cf6' },
    oceanic: { name: 'Oceanic Teal', from: '#a7f3d0', via: '#2dd4bf', to: '#0e7490' },
};

// --- Initial State Definitions ---
const initialCampaigns: Campaign[] = [];
const initialAccounts: Account[] = [];
const initialGlobalPlaceholders: GlobalPlaceholder[] = [
    { id: 'ph1', key: 'business_name', value: 'NovaSend Inc.' },
    { id: 'ph2', key: 'support_email', value: 'support@novasend.app' },
];
const initialCampaignTemplates: CampaignTemplate[] = [
    { id: 'template1', name: 'Welcome Message', message: '{Hi|Hello} {FirstName}! Welcome to {{business_name}}. We are glad to have you.' },
    { id: 'template2', name: 'Sale Reminder', message: 'Just a friendly reminder that our sale ends in 24 hours! Don\'t miss out on great deals.' }
];

// Helper function to load state from localStorage
const loadState = <T,>(key: string, defaultValue: T): T => {
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error(`Failed to parse ${key} from localStorage`, e);
    }
    return defaultValue;
};

// Check if a campaign ID is a legacy client-generated string (not a DB integer)
const isLegacyCampaignId = (id: string): boolean => {
    return id.startsWith('camp_') || isNaN(Number(id));
};


const App: React.FC = () => {
    const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
    const [theme, setTheme] = useState<Theme>(() => loadState<Theme>('nova_theme', 'dark'));
    const [palette, setPalette] = useState<GradientPalette>(() => loadState<GradientPalette>('nova_palette', 'nova'));
    const [agentStatus, setAgentStatus] = useState<AgentStatus>('Offline');

    const [accounts, setAccounts] = useState<Account[]>(() => loadState<Account[]>('nova_accounts', initialAccounts));
    const [selectedAccountId, setSelectedAccountId] = useState<string>(() => loadState<string>('nova_selected_account_id', ''));
    const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadState<Campaign[]>('nova_campaigns', initialCampaigns));
    const [contacts, setContacts] = useState<Contact[]>(() => loadState<Contact[]>('nova_contacts', []));
    const [groups, setGroups] = useState<Group[]>(() => {
        const loaded = loadState<Group[]>('nova_groups', []);
        return loaded.length > 0 ? loaded : [{ id: 'group_default', name: 'General' }];
    });
    const [notification, setNotification] = useState<Notification | null>(null);
    const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);
    const [campaignLogs, setCampaignLogs] = useState<CampaignLogEntry[]>([]);
    const [globalPlaceholders, setGlobalPlaceholders] = useState<GlobalPlaceholder[]>(() => loadState<GlobalPlaceholder[]>('nova_global_placeholders', initialGlobalPlaceholders));
    const [campaignTemplates, setCampaignTemplates] = useState<CampaignTemplate[]>(() => loadState<CampaignTemplate[]>('nova_campaign_templates', initialCampaignTemplates));
    
    // --- Auth-aware routing ---
    const { isAuthenticated, isLoading } = useAuth();

    const handleSetTheme = async (newTheme: Theme) => {
        setTheme(newTheme);
        if (isAuthenticated) {
            try {
                await userSettingsApi.updateSettings({ theme: newTheme });
            } catch (err) {
                console.error("Failed to save theme setting to DB", err);
            }
        }
    };

    const handleSetPalette = async (newPalette: GradientPalette) => {
        setPalette(newPalette);
        if (isAuthenticated) {
            try {
                await userSettingsApi.updateSettings({ palette: newPalette });
            } catch (err) {
                console.error("Failed to save palette setting to DB", err);
            }
        }
    };

    const handleSetGlobalPlaceholders = async (newPlaceholders: GlobalPlaceholder[] | ((prev: GlobalPlaceholder[]) => GlobalPlaceholder[])) => {
        if (typeof newPlaceholders === 'function') {
            setGlobalPlaceholders(prev => {
                const next = newPlaceholders(prev);
                if (isAuthenticated) {
                    userSettingsApi.updateSettings({ global_placeholders: next }).catch(err => {
                        console.error("Failed to save placeholders setting to DB", err);
                    });
                }
                return next;
            });
        } else {
            setGlobalPlaceholders(newPlaceholders);
            if (isAuthenticated) {
                try {
                    await userSettingsApi.updateSettings({ global_placeholders: newPlaceholders });
                } catch (err) {
                    console.error("Failed to save placeholders setting to DB", err);
                }
            }
        }
    };

    // Sync settings from backend on auth
    useEffect(() => {
        if (!isAuthenticated) return;
        (async () => {
            try {
                const result = await userSettingsApi.getSettings();
                if (result && result.settings) {
                    const { theme: sTheme, palette: sPalette, global_placeholders: sPlaceholders } = result.settings;
                    if (sTheme) setTheme(sTheme);
                    if (sPalette) setPalette(sPalette);
                    if (sPlaceholders) setGlobalPlaceholders(sPlaceholders);
                }
            } catch (_) {
                // Keep local state if backend fails
            }
        })();
    }, [isAuthenticated]);

    const [isCampaignEditorOpen, setIsCampaignEditorOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);

    // Sync campaigns from backend on auth, replacing any legacy localStorage-only campaigns
    useEffect(() => {
        if (!isAuthenticated) return;
        (async () => {
            try {
                const result = await campaignApi.list();
                const serverCampaigns: Campaign[] = (result.campaigns || []).map((c: any) => ({
                    id: String(c.id),
                    name: c.name,
                    status: c.status as CampaignStatus,
                    sent: c.sent || 0,
                    failed: c.failed || 0,
                    total: c.total || 0,
                    createdAt: c.created_at?.split('T')[0] || '',
                    accountId: String(c.account_id || ''),
                    message: c.message || '',
                    sendAsCaption: c.send_as_caption || false,
                    targetGroups: c.config?.targetGroups || [],
                    batchSize: c.config?.batchSize,
                    batchDelayMin: c.config?.batchDelayMin,
                    batchDelayMax: c.config?.batchDelayMax,
                    simulateTyping: c.config?.simulateTyping,
                    pacingMessagesPerHour: c.config?.pacingMessagesPerHour,
                    staggerDurationHours: c.config?.staggerDurationHours,
                    sendWindowStart: c.config?.sendWindowStart,
                    sendWindowEnd: c.config?.sendWindowEnd,
                    warmUpMode: c.config?.warmUpMode,
                    detectOptOut: c.config?.detectOptOut,
                    scheduleType: c.config?.scheduleType,
                    scheduledAt: c.config?.scheduledAt,
                    timezone: c.config?.timezone,
                    recurringFrequency: c.config?.recurringFrequency,
                    recurringDays: c.config?.recurringDays,
                    sendInContactTimezone: c.config?.sendInContactTimezone,
                    useAttachmentFromFolder: c.config?.useAttachmentFromFolder,
                }));
                setCampaigns(serverCampaigns);
                localStorage.setItem('nova_campaigns', JSON.stringify(serverCampaigns));
            } catch (_) {
                const stored = loadState<Campaign[]>('nova_campaigns', []);
                const legacyCount = stored.filter(c => isLegacyCampaignId(c.id)).length;
                if (legacyCount > 0) {
                    const cleaned = stored.filter(c => !isLegacyCampaignId(c.id));
                    setCampaigns(cleaned);
                    localStorage.setItem('nova_campaigns', JSON.stringify(cleaned));
                }
            }
        })();
    }, [isAuthenticated]);

    // Sync accounts from backend on auth, replacing any hardcoded/localStorage-only accounts
    useEffect(() => {
        if (!isAuthenticated) return;
        (async () => {
            try {
                const result = await accountApi.list();
                const serverAccounts: Account[] = (result.accounts || []).map((a: any) => ({
                    id: String(a.id),
                    name: a.name,
                    status: a.status || 'Disconnected',
                    successful_sends: a.successful_sends ?? 0,
                    failed_sends: a.failed_sends ?? 0,
                    retry_count: a.retry_count ?? 0,
                    browser_crashes: a.browser_crashes ?? 0,
                    session_resets: a.session_resets ?? 0,
                }));
                if (serverAccounts.length > 0) {
                    setAccounts(serverAccounts);
                    localStorage.setItem('nova_accounts', JSON.stringify(serverAccounts));
                    if (!serverAccounts.find(a => a.id === selectedAccountId)) {
                        setSelectedAccountId(serverAccounts[0].id);
                    }
                }
            } catch (_) {
                // Backend unreachable — keep localStorage accounts
            }
        })();
    }, [isAuthenticated]);

    // Sync contacts from backend on auth
    useEffect(() => {
        if (!isAuthenticated) return;
        (async () => {
            try {
                const result = await contactApi.list();
                if (result && result.contacts) {
                    const serverContacts = result.contacts.map((c: any) => ({
                        id: String(c.id),
                        number: c.number,
                        firstName: c.first_name || '',
                        lastName: c.last_name || '',
                        groups: c.groups || [],
                        status: c.status || 'Subscribed',
                    }));
                    setContacts(serverContacts);
                    localStorage.setItem('nova_contacts', JSON.stringify(serverContacts));
                }
            } catch (_) {
                // Backend unreachable — keep localStorage contacts
            }
        })();
    }, [isAuthenticated]);

    // Sync groups from backend on auth
    useEffect(() => {
        if (!isAuthenticated) return;
        (async () => {
            try {
                const result = await groupApi.list();
                if (result && result.groups) {
                    const serverGroups = result.groups.map((g: any) => ({
                        id: String(g.id),
                        name: g.name,
                    }));
                    setGroups(serverGroups);
                    localStorage.setItem('nova_groups', JSON.stringify(serverGroups));
                }
            } catch (_) {
                // Backend unreachable — keep localStorage groups
            }
        })();
    }, [isAuthenticated]);

    const runningCampaignId = useMemo(() => {
        const running = campaigns.find(c => c.status === CampaignStatus.RUNNING || c.status === CampaignStatus.PAUSED);
        return running ? running.id : null;
    }, [campaigns]);
    
    // --- Save state to localStorage on change ---
    useEffect(() => { localStorage.setItem('nova_theme', JSON.stringify(theme)); }, [theme]);
    useEffect(() => { localStorage.setItem('nova_palette', JSON.stringify(palette)); }, [palette]);
    useEffect(() => { localStorage.setItem('nova_accounts', JSON.stringify(accounts)); }, [accounts]);
    useEffect(() => { localStorage.setItem('nova_selected_account_id', JSON.stringify(selectedAccountId)); }, [selectedAccountId]);
    useEffect(() => { localStorage.setItem('nova_campaigns', JSON.stringify(campaigns)); }, [campaigns]);
    useEffect(() => { localStorage.setItem('nova_contacts', JSON.stringify(contacts)); }, [contacts]);
    useEffect(() => { localStorage.setItem('nova_groups', JSON.stringify(groups)); }, [groups]);
    useEffect(() => { localStorage.setItem('nova_global_placeholders', JSON.stringify(globalPlaceholders)); }, [globalPlaceholders]);
    useEffect(() => { localStorage.setItem('nova_campaign_templates', JSON.stringify(campaignTemplates)); }, [campaignTemplates]);


    // --- Agent Communication Hook ---
    useEffect(() => {
        if (!isAuthenticated) return;
        
        const pollAgentStatus = async () => {
            try {
                const data = await agentApi.getStatus();
                
                setAgentStatus(data.agent_status || 'Online');

                if (data.is_connected && data.account_id) {
                    setAccounts(prev => {
                        const hasChanges = prev.some(a => 
                            (a.id === String(data.account_id) && a.status !== 'Connected') ||
                            (a.id !== String(data.account_id) && a.status !== 'Disconnected')
                        );
                        if (!hasChanges) return prev;
                        return prev.map(a =>
                            a.id === String(data.account_id) ? { ...a, status: 'Connected' } : { ...a, status: 'Disconnected' }
                        );
                    });
                } else {
                    setAccounts(prev => {
                        const hasChanges = prev.some(a => a.status !== 'Disconnected');
                        if (!hasChanges) return prev;
                        return prev.map(a => ({ ...a, status: 'Disconnected' }));
                    });
                }
                
                if (data.is_running || data.campaign_id) {
                    setCampaigns(prev => prev.map(c => {
                        if (String(c.id) === String(data.campaign_id)) {
                            let newStatus = c.status;
                            if (data.is_running && !data.is_paused) {
                                newStatus = CampaignStatus.RUNNING;
                            } else if (data.is_running && data.is_paused) {
                                newStatus = CampaignStatus.PAUSED;
                            } else if (!data.is_running) {
                                // Campaign has finished, determine final status
                                if (data.sent_count === 0 && data.failed_count > 0 && data.failed_count >= c.total) {
                                    newStatus = CampaignStatus.FAILED;
                                } else {
                                    newStatus = CampaignStatus.COMPLETED;
                                }
                            }
                            
                            return { ...c, status: newStatus, sent: data.sent_count, failed: data.failed_count };
                        }
                        // If agent crashes/resets, its campaign_id will be null. Pause any running campaign on the UI for safety.
                        if (String(c.id) === String(runningCampaignId) && !data.campaign_id) {
                            return { ...c, status: CampaignStatus.PAUSED };
                        }
                        return c;
                    }));

                    const rawSystemLogs: string[] = data.system_logs || [];
                    const parsedSystemLogs: SystemLogEntry[] = rawSystemLogs.map(logString => {
                        const match = logString.match(/^\[(.*?)\] (.*)$/);
                        if (match) {
                            const [, timestamp, message] = match;
                            let level = 'INFO';
                            if (message.toLowerCase().includes('fail') || message.toLowerCase().includes('error')) {
                                level = 'ERROR';
                            } else if (message.toLowerCase().includes('warn') || message.toLowerCase().includes('paused')) {
                                level = 'WARN';
                            }
                            return { timestamp, message, level };
                        }
                        return { timestamp: '??:??:??', message: logString, level: 'INFO' };
                    });
                    setSystemLogs(parsedSystemLogs);

                    const rawCampaignLogs: any[] = data.campaign_logs || [];
                    const parsedCampaignLogs: CampaignLogEntry[] = rawCampaignLogs.map((log, index) => {
                        let statusColor: 'green' | 'red' | 'yellow' | 'gray' = 'gray';
                        const logStatus = log.status?.toLowerCase() || '';

                        if (logStatus === 'sent') statusColor = 'green';
                        else if (logStatus === 'failed') statusColor = 'red';
                        
                        return {
                            id: `${log.timestamp}-${index}-${log.number}`,
                            number: log.number || 'N/A',
                            text: log.message_preview || '',
                            type: 'Text',
                            status: log.status || 'Unknown',
                            statusColor: statusColor,
                            timestamp: log.timestamp || '??:??:??',
                        };
                    });
                    setCampaignLogs(parsedCampaignLogs);
                }

            } catch (error) {
                setAgentStatus('Offline');
                if (runningCampaignId) {
                     setCampaigns(prev => prev.map(c => 
                        c.id === runningCampaignId ? { ...c, status: CampaignStatus.PAUSED } : c
                    ));
                    if(agentStatus !== 'Offline') {
                        showNotification({ message: 'Agent disconnected. Campaign paused.', type: 'warning' });
                    }
                }
            }
        };

        const intervalId = setInterval(pollAgentStatus, 2000);
        return () => clearInterval(intervalId);
    }, [runningCampaignId, agentStatus, isAuthenticated]);


    const showNotification = (notificationData: Notification) => {
        setNotification(notificationData);
        setTimeout(() => {
            setNotification(null);
        }, 4000); 
    };
    
    const startCampaign = async (campaignToStart: Campaign) => {
        const targetGroupSet = new Set(campaignToStart.targetGroups || []);
        if (targetGroupSet.size === 0) {
            showNotification({ message: 'Campaign has no target groups selected.', type: 'error' });
            return;
        }

        const contactsToSend = contacts.filter(c => 
            c.status !== 'Unsubscribed' &&
            c.groups?.some(g => targetGroupSet.has(g))
        );
        
        if (contactsToSend.length === 0) {
            showNotification({ message: 'No contacts found in the selected target groups.', type: 'warning' });
            return;
        }

        const campaignData = {
            accountId: campaignToStart.accountId,
            message: campaignToStart.message || '',
            sendAsCaption: campaignToStart.sendAsCaption || false,
            useAttachmentFromFolder: campaignToStart.useAttachmentFromFolder || false,
            contacts: contactsToSend,
            targetGroups: campaignToStart.targetGroups,
            globalPlaceholders: globalPlaceholders,
            messageDelayMin: campaignToStart.batchSize ? 1 : (campaignToStart.batchDelayMin ?? 1),
            messageDelayMax: campaignToStart.batchSize ? 3 : (campaignToStart.batchDelayMax ?? 2),
            batchSize: campaignToStart.batchSize,
            batchDelayMin: campaignToStart.batchDelayMin,
            batchDelayMax: campaignToStart.batchDelayMax,
            sendWindowStart: campaignToStart.sendWindowStart,
            sendWindowEnd: campaignToStart.sendWindowEnd,
            pacingMessagesPerHour: campaignToStart.pacingMessagesPerHour,
            staggerDurationHours: campaignToStart.staggerDurationHours,
            warmUpMode: campaignToStart.warmUpMode,
            detectOptOut: campaignToStart.detectOptOut,
        };

        try {
            await campaignApi.launch(campaignToStart.id, campaignData);
            setCampaigns(prev => prev.map(c => c.id === campaignToStart.id ? { ...c, status: CampaignStatus.RUNNING, sent: 0, failed: 0 } : c));
            showNotification({ message: `Campaign "${campaignToStart.name}" launched!`, type: 'info' });
            setSystemLogs([]);
            setCampaignLogs([]);
        } catch (error: any) {
            showNotification({ message: `Error: ${error.message}`, type: 'error' });
        }
    };

    const handleCampaignStatusChange = async (campaignId: string, newStatus: CampaignStatus, options: { silent?: boolean } = {}) => {
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return;

        let agentAction = '';
        if (newStatus === CampaignStatus.RUNNING) {
            if (campaign.status === CampaignStatus.PAUSED) {
                agentAction = 'resume';
            } else {
                startCampaign(campaign);
                return; 
            }
        } else if (newStatus === CampaignStatus.PAUSED) {
            agentAction = 'pause';
        } else if (newStatus === CampaignStatus.DRAFT || newStatus === CampaignStatus.COMPLETED) {
            if (runningCampaignId === campaignId) {
                 agentAction = 'stop';
            }
        }
        
        if (agentAction) {
            try {
                await campaignApi.control(campaignId, agentAction);
                 if (!options.silent) {
                    showNotification({ message: `Campaign action '${agentAction}' sent.`, type: 'info' });
                }
            } catch (error: any) {
                 if (!options.silent) {
                    showNotification({ message: `Agent action failed: ${error.message}`, type: 'error' });
                }
            }
        }
        
        // Update UI state immediately for responsiveness
        setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: newStatus } : c));
    };


    const handleSaveCampaign = async (campaignToSave: Campaign) => {
        if (!selectedAccountId) {
            showNotification({ message: 'Please select an account first. Go to Accounts and add/connect one.', type: 'error' });
            return;
        }
        const isNew = !campaigns.some(c => c.id === campaignToSave.id);
        
        const targetGroupSet = new Set(campaignToSave.targetGroups || []);
        const totalContacts = new Set(
            contacts
                .filter(c => c.status !== 'Unsubscribed' && c.groups?.some(g => targetGroupSet.has(g)))
                .map(c => c.id)
        ).size;

        if (isNew) {
            try {
                const result = await campaignApi.create({
                    name: campaignToSave.name,
                    account_id: Number(selectedAccountId) || selectedAccountId,
                    message: campaignToSave.message || '',
                    send_as_caption: campaignToSave.sendAsCaption || false,
                    total: totalContacts,
                    batchSize: campaignToSave.batchSize,
                    batchDelayMin: campaignToSave.batchDelayMin,
                    batchDelayMax: campaignToSave.batchDelayMax,
                    simulateTyping: campaignToSave.simulateTyping,
                    pacingMessagesPerHour: campaignToSave.pacingMessagesPerHour,
                    staggerDurationHours: campaignToSave.staggerDurationHours,
                    sendWindowStart: campaignToSave.sendWindowStart,
                    sendWindowEnd: campaignToSave.sendWindowEnd,
                    warmUpMode: campaignToSave.warmUpMode,
                    detectOptOut: campaignToSave.detectOptOut,
                    targetGroups: campaignToSave.targetGroups || [],
                    scheduleType: campaignToSave.scheduleType,
                    scheduledAt: campaignToSave.scheduledAt,
                    timezone: campaignToSave.timezone,
                    recurringFrequency: campaignToSave.recurringFrequency,
                    recurringDays: campaignToSave.recurringDays,
                    sendInContactTimezone: campaignToSave.sendInContactTimezone,
                    useAttachmentFromFolder: campaignToSave.useAttachmentFromFolder,
                });

                const savedCampaign = result.campaign;
                const newCampaign: Campaign = {
                    ...campaignToSave,
                    id: String(savedCampaign.id),
                    accountId: selectedAccountId,
                    createdAt: savedCampaign.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
                    sent: 0,
                    failed: 0,
                    total: totalContacts,
                };
                setCampaigns(prev => [...prev, newCampaign]);
                showNotification({ message: `Campaign "${campaignToSave.name}" saved.`, type: 'success' });
            } catch (error: any) {
                showNotification({ message: `Save failed: ${error.message}`, type: 'error' });
                return;
            }
        } else {
            try {
                await campaignApi.update(campaignToSave.id, {
                    name: campaignToSave.name,
                    message: campaignToSave.message || '',
                    send_as_caption: campaignToSave.sendAsCaption || false,
                    total: totalContacts,
                    batchSize: campaignToSave.batchSize,
                    batchDelayMin: campaignToSave.batchDelayMin,
                    batchDelayMax: campaignToSave.batchDelayMax,
                    simulateTyping: campaignToSave.simulateTyping,
                    pacingMessagesPerHour: campaignToSave.pacingMessagesPerHour,
                    staggerDurationHours: campaignToSave.staggerDurationHours,
                    sendWindowStart: campaignToSave.sendWindowStart,
                    sendWindowEnd: campaignToSave.sendWindowEnd,
                    warmUpMode: campaignToSave.warmUpMode,
                    detectOptOut: campaignToSave.detectOptOut,
                    targetGroups: campaignToSave.targetGroups || [],
                    scheduleType: campaignToSave.scheduleType,
                    scheduledAt: campaignToSave.scheduledAt,
                    timezone: campaignToSave.timezone,
                    recurringFrequency: campaignToSave.recurringFrequency,
                    recurringDays: campaignToSave.recurringDays,
                    sendInContactTimezone: campaignToSave.sendInContactTimezone,
                    useAttachmentFromFolder: campaignToSave.useAttachmentFromFolder,
                });

                setCampaigns(prev => prev.map(c => c.id === campaignToSave.id ? { ...c, ...campaignToSave, total: totalContacts } : c));
                showNotification({ message: `Campaign "${campaignToSave.name}" saved.`, type: 'success' });
            } catch (error: any) {
                showNotification({ message: `Update failed: ${error.message}`, type: 'error' });
                return;
            }
        }
        setIsCampaignEditorOpen(false);
    };
    
    const handleAddAccount = async (accountName: string) => {
        try {
            const result = await accountApi.create(accountName, '');
            const savedAccount = result.account;
            const newAccount: Account = {
                id: String(savedAccount.id),
                name: savedAccount.name,
                status: savedAccount.status || 'Disconnected',
            };
            setAccounts(prev => [...prev, newAccount]);
            if (accounts.length === 0) {
                setSelectedAccountId(newAccount.id);
            }
            showNotification({ message: `Account "${accountName}" created. Connect it via QR to start WhatsApp.`, type: 'info' });
        } catch (error: any) {
            showNotification({ message: `Failed to create account: ${error.message}`, type: 'error' });
        }
        setIsAddAccountModalOpen(false);
    };

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [theme]);

    useEffect(() => {
        const root = document.documentElement;
        const selectedGradient = gradients[palette];
        root.style.setProperty('--gradient-from', selectedGradient.from);
        root.style.setProperty('--gradient-via', selectedGradient.via);
        root.style.setProperty('--gradient-to', selectedGradient.to);
    }, [palette]);

    const renderPage = () => {
        switch (currentPage) {
            case 'Dashboard': return <Dashboard />;
            case 'Campaigns': return <Campaigns />;
            case 'Analytics': return <Analytics />;
            case 'Accounts': return <Accounts />;
            case 'Contacts': return <Contacts />;
            case 'Settings': return <Settings />;
            case 'Utilities': return <Utilities />;
            case 'Login': return <LoginPage />;
            case 'Signup': return <SignupPage />;
            case 'AdminDashboard': return <AdminDashboard />;
            case 'AdminUsers': return <AdminUsers />;
            case 'AdminErrors': return <AdminErrors />;
            case 'AdminAuditLog': return <AdminAuditLog />;
            case 'AdminSettings': return <AdminSettings />;
            case 'AdminNotifications': return <AdminNotifications />;
            case 'AdminLogTail': return <AdminLogTail />;
            case 'AdminTasks': return <AdminTasks />;
            case 'AdminReports': return <AdminReports />;
            default: return <Dashboard />;
        }
    };

    // FIX: Corrected the useMemo hook syntax by moving the dependency array to be the second argument of useMemo, instead of being inside the callback function.
    const contextValue: AppContextType = useMemo(() => ({
        currentPage,
        setCurrentPage,
        theme,
        setTheme: handleSetTheme,
        palette,
        setPalette: handleSetPalette,
        gradients,
        accounts,
        setAccounts,
        selectedAccountId,
        setSelectedAccountId,
        campaigns,
        setCampaigns,
        contacts,
        setContacts,
        groups,
        setGroups,
        notification,
        showNotification,
        isCampaignEditorOpen,
        setIsCampaignEditorOpen,
        editingCampaign,
        setEditingCampaign,
        isAddAccountModalOpen,
        setIsAddAccountModalOpen,
        systemLogs,
        campaignLogs,
        globalPlaceholders,
        setGlobalPlaceholders: handleSetGlobalPlaceholders,
        runningCampaignId,
        handleCampaignStatusChange,
        agentStatus,
        campaignTemplates,
        setCampaignTemplates,
    }), [currentPage, theme, palette, accounts, selectedAccountId, campaigns, contacts, groups, notification, isCampaignEditorOpen, editingCampaign, isAddAccountModalOpen, systemLogs, campaignLogs, globalPlaceholders, runningCampaignId, agentStatus, campaignTemplates, isAuthenticated]);

    // --- Loading state: full-screen spinner while auth is being validated ---
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-transparent border-t-[var(--gradient-from)] rounded-full animate-spin"></div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Loading NovaSend...</p>
                </div>
            </div>
        );
    }

    // --- Unauthenticated state: show Login or Signup page only ---
    if (!isAuthenticated) {
        return (
            <AppContext.Provider value={contextValue}>
                {currentPage === 'Signup' ? <SignupPage /> : <LoginPage />}
            </AppContext.Provider>
        );
    }

    // --- Authenticated state: normal app layout ---
    return (
        <AppContext.Provider value={contextValue}>
            <div className={`flex h-screen font-sans text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-900 transition-colors duration-300`}>
                <NavigationRail />
                <main className="flex-1 flex flex-col overflow-hidden transition-all duration-300" style={{ paddingLeft: '180px' }}>
                    <Header />
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                        {renderPage()}
                    </div>
                </main>
                <ContextualPanel />
                {isCampaignEditorOpen && (
                    <CampaignEditorModal 
                        campaignToEdit={editingCampaign}
                        onClose={() => setIsCampaignEditorOpen(false)}
                        onSave={handleSaveCampaign}
                    />
                )}
                 {isAddAccountModalOpen && (
                    <AddAccountModal 
                        onClose={() => setIsAddAccountModalOpen(false)}
                        onAdd={handleAddAccount}
                    />
                )}
            </div>
        </AppContext.Provider>
    );
};

const AppWrapper: React.FC = () => (
    <AuthProvider>
        <App />
    </AuthProvider>
);

export default AppWrapper;