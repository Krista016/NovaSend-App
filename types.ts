// FIX: Import Dispatch and SetStateAction types from React to resolve type errors.
import type { Dispatch, SetStateAction } from 'react';

export type Page = 'Dashboard' | 'Campaigns' | 'Contacts' | 'Accounts' | 'Analytics' | 'Settings' | 'Utilities' | 'Login' | 'Signup' | 'AdminDashboard' | 'AdminUsers' | 'AdminErrors' | 'AdminAuditLog' | 'AdminSettings' | 'AdminNotifications' | 'AdminLogTail' | 'AdminTasks' | 'AdminReports';

export type Theme = 'light' | 'dark';

export type GradientPalette = 'nova' | 'sunset' | 'oceanic';

export interface Gradient {
    name: string;
    from: string;
    via: string;
    to: string;
}

export interface Account {
    id: string;
    name: string;
    status: 'Connected' | 'Disconnected';
    successful_sends?: number;
    failed_sends?: number;
    retry_count?: number;
    browser_crashes?: number;
    session_resets?: number;
}


export interface Group {
    id: string;
    name: string;
}

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type ContactStatus = 'Subscribed' | 'Unsubscribed' | 'Active' | 'Inactive' | 'Blocked' | 'New' | 'Pending' | 'Prospect';

export interface Contact {
    id: string;
    number: string;
    firstName?: string;
    lastName?: string;
    status?: ContactStatus;
    groups?: string[]; // Array of group names
}


export enum CampaignStatus {
    DRAFT = 'Draft',
    SCHEDULED = 'Scheduled',
    RUNNING = 'Running',
    PAUSED = 'Paused',
    COMPLETED = 'Completed',
    FAILED = 'Failed'
}

export interface CampaignAttachment {
    name: string;
    type: 'Image' | 'Video' | 'Document';
    // Base64 encoded file content and mimeType, optional for storage/templates
    data?: string;
    mimeType?: string;
}

export interface CampaignTemplate {
    id: string;
    name: string;
    // Copy relevant fields from Campaign
    message?: string;
    attachment?: CampaignAttachment;
    caption?: string;
    // Scheduling
    scheduleType?: 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING';
    recurringFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    recurringDays?: DayOfWeek[];
    sendWindowStart?: string;
    sendWindowEnd?: string;
    timezone?: string;
    sendInContactTimezone?: boolean;
    // Batching
    batchSize?: number;
    batchDelayMin?: number;
    batchDelayMax?: number;
    simulateTyping?: boolean;
    // New Advanced Features
    pacingMessagesPerHour?: number;
    staggerDurationHours?: number;
    warmUpMode?: boolean;
    detectOptOut?: boolean;
}


export interface Campaign {
    id: string;
    name: string;
    status: CampaignStatus;
    sent: number;
    failed: number;
    total: number;
    createdAt: string;
    accountId: string;
    message?: string;
    attachment?: CampaignAttachment;
    useAttachmentFromFolder?: boolean;
    sendAsCaption?: boolean;
    targetGroups?: string[];
    
    // Advanced Scheduling
    scheduledAt?: string;
    scheduleType?: 'IMMEDIATE' | 'SCHEDULED' | 'RECURRING';
    recurringFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    recurringDays?: DayOfWeek[];
    sendWindowStart?: string; // e.g., "09:00"
    sendWindowEnd?: string; // e.g., "17:00"
    timezone?: string;
    sendInContactTimezone?: boolean;
    pacingMessagesPerHour?: number;
    staggerDurationHours?: number;
    
    // Batching & Anti-Blocking
    batchSize?: number;
    batchDelayMin?: number; // in seconds
    batchDelayMax?: number; // in seconds
    simulateTyping?: boolean;
    warmUpMode?: boolean;
    detectOptOut?: boolean;
}


export type NotificationType = 'success' | 'warning' | 'error' | 'info';

export interface Notification {
    message: string;
    type: NotificationType;
}

export interface SystemLogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export interface CampaignLogEntry {
    id: string | number;
    number: string;
    text: string;
    type: 'Text' | 'Media' | 'Document';
    caption?: string;
    status: string;
    statusColor: 'green' | 'red' | 'yellow' | 'gray';
    timestamp: string;
}


export interface GlobalPlaceholder {
    id: string;
    key: string;
    value: string;
}

export type AgentStatus = 'Online' | 'Offline' | 'Busy';


export interface AppContextType {
    currentPage: Page;
    setCurrentPage: (page: Page) => void;
    theme: Theme;
    setTheme: (theme: Theme) => void;
    palette: GradientPalette;
    setPalette: (palette: GradientPalette) => void;
    gradients: Record<GradientPalette, Gradient>;
    accounts: Account[];
    // FIX: Use imported Dispatch and SetStateAction types.
    setAccounts: Dispatch<SetStateAction<Account[]>>;
    selectedAccountId: string;
    setSelectedAccountId: (id: string) => void;
    campaigns: Campaign[];
    // FIX: Use imported Dispatch and SetStateAction types.
    setCampaigns: Dispatch<SetStateAction<Campaign[]>>;
    contacts: Contact[];
    // FIX: Use imported Dispatch and SetStateAction types.
    setContacts: Dispatch<SetStateAction<Contact[]>>;
    groups: Group[];
    // FIX: Use imported Dispatch and SetStateAction types.
    setGroups: Dispatch<SetStateAction<Group[]>>;
    notification: Notification | null;
    showNotification: (notification: Notification) => void;
    // For global campaign editor modal
    isCampaignEditorOpen: boolean;
    setIsCampaignEditorOpen: (isOpen: boolean) => void;
    editingCampaign: Campaign | null;
    setEditingCampaign: (campaign: Campaign | null) => void;
    // For global add account modal
    isAddAccountModalOpen: boolean;
    setIsAddAccountModalOpen: (isOpen: boolean) => void;
    // Live logs
    systemLogs: SystemLogEntry[];
    campaignLogs: CampaignLogEntry[];
    // Global Placeholders
    globalPlaceholders: GlobalPlaceholder[];
    // FIX: Use imported Dispatch and SetStateAction types.
    setGlobalPlaceholders: Dispatch<SetStateAction<GlobalPlaceholder[]>>;
    // For running campaigns
    runningCampaignId: string | null;
    handleCampaignStatusChange: (campaignId: string, newStatus: CampaignStatus, options?: { silent?: boolean }) => void;
    // Agent status
    agentStatus: AgentStatus;
    // Campaign Templates
    campaignTemplates: CampaignTemplate[];
    // FIX: Use imported Dispatch and SetStateAction types.
    setCampaignTemplates: Dispatch<SetStateAction<CampaignTemplate[]>>;
}

// Auth-related types
export interface User {
    id: number;
    email: string;
    name: string;
    plan: string;
    role: string;
    account_status: string;
    created_at: string;
}

export interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface SignupCredentials {
    email: string;
    password: string;
    name: string;
}

export interface AuthResponse {
    status: string;
    token: string;
    user: User;
}

// Admin Panel Types
export interface AdminUser {
    id: number;
    email: string;
    name: string;
    plan: string;
    role: string;
    account_status: string;
    created_at: string;
    last_login_at: string | null;
    login_history?: LoginHistoryEntry[];
}

export interface LoginHistoryEntry {
    timestamp: string;
    ip: string;
    user_agent: string;
}

export interface ErrorLogEntry {
    id: number;
    timestamp: string;
    level: string;
    error_type: string;
    message: string;
    stack_trace: string | null;
    source: string;
    user_id: number | null;
    user_email: string | null;
    url: string | null;
    context_data: Record<string, any>;
    resolved: boolean;
    resolved_at: string | null;
    resolved_by: number | null;
}

export interface AuditLogEntry {
    id: number;
    timestamp: string;
    admin_id: number;
    admin_email: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, any>;
    ip_address: string | null;
}

export interface SystemSetting {
    id: number;
    key: string;
    value: string;
    category: string;
    updated_at: string;
    updated_by: number | null;
}

export interface AdminNotification {
    id: number;
    title: string;
    message: string;
    notification_type: string;
    target_type: string;
    target_users: number[];
    created_by: number;
    created_at: string;
    is_sent: boolean;
}

export interface ScheduledTask {
    id: number;
    name: string;
    status: string;
    cron_expression: string | null;
    last_run: string | null;
    next_run: string | null;
    logs: TaskLogEntry[];
    created_at: string;
}

export interface TaskLogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export interface AdminStats {
    users: {
        total: number;
        active_now: number;
        daily_active: number;
        weekly_active: number;
        monthly_active: number;
        inactive: number;
        new_today: number;
        new_this_week: number;
    };
    errors: {
        total: number;
        unresolved: number;
        critical: number;
        today: number;
    };
    campaigns: {
        total: number;
        running: number;
        completed: number;
    };
    accounts: {
        total: number;
        connected: number;
    };
    trends: {
        registrations: { date: string; count: number }[];
        errors: { date: string; count: number }[];
    };
    server: {
        cpu_percent: number;
        memory_percent: number;
        memory_used_gb: number;
        memory_total_gb: number;
        disk_percent: number;
        disk_used_gb: number;
        disk_total_gb: number;
    };
}

export interface PaginatedResponse<T> {
    status: string;
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
    [key: string]: any;
}