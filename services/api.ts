const API_BASE = '/api';

function getToken(): string | null {
    return localStorage.getItem('novasend_token');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        localStorage.removeItem('novasend_token');
        localStorage.removeItem('novasend_user');
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
            const error = await response.json();
            errorMessage = error.message || errorMessage;
        } catch (_) {
            const text = await response.text().catch(() => '');
            if (text) {
                errorMessage = text.substring(0, 200);
            } else {
                errorMessage = `Request failed (${response.status})`;
            }
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

// Auth API
export const authApi = {
    login: (email: string, password: string) =>
        request<{ status: string; token: string; user: any }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        }),
    signup: (email: string, password: string, name: string) =>
        request<{ status: string; token: string; user: any }>('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        }),
    me: () => request<{ status: string; user: any }>('/auth/me'),
};

// Agent/Status API
// The main Flask server (port 5000) now handles all agent functionality
// including browser automation, campaign execution, and live logging.
// The external agent on port 5001 is still supported as an optional
// dedicated automation process.
const AGENT_BASE = 'http://127.0.0.1:5001';

export const agentApi = {
    getStatus: async () => {
        // Always route through backend /api/status so database updates correctly in real-time.
        // The backend `/status` internally queries the local agent if online.
        return request<any>('/status');
    },
};

// Campaign API
export const campaignApi = {
    create: (data: any) =>
        request<any>('/campaigns', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: string | number, data: any) =>
        request<any>(`/campaigns/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    launch: async (campaignId: string | number, data: any) => {
        try {
            const res = await fetch(`${AGENT_BASE}/status`);
            if (res.ok) {
                const localRes = await fetch(`${AGENT_BASE}/launch-campaign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: campaignId,
                        ...data
                    })
                });
                if (localRes.ok) {
                    // Sync backend database status to Running and pass contacts/total
                    try {
                        await request<any>(`/campaigns/${campaignId}/launch`, {
                            method: 'POST',
                            body: JSON.stringify({
                                ...data,
                                local_agent: true
                            }),
                        });
                    } catch (dbErr) {
                        console.error("Failed to sync launch with backend DB", dbErr);
                    }
                    return localRes.json();
                }
                const errText = await localRes.text();
                throw new Error(errText || 'Failed to launch campaign on local agent');
            }
        } catch (_) {
            // Fall back
        }
        return request<any>(`/campaigns/${campaignId}/launch`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    control: async (campaignId: string | number, action: string) => {
        try {
            const res = await fetch(`${AGENT_BASE}/status`);
            if (res.ok) {
                const localRes = await fetch(`${AGENT_BASE}/control-campaign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });
                if (localRes.ok) {
                    // Sync backend database control action
                    try {
                        await request<any>(`/campaigns/${campaignId}/control`, {
                            method: 'POST',
                            body: JSON.stringify({ action }),
                        });
                    } catch (dbErr) {
                        console.error("Failed to sync control with backend DB", dbErr);
                    }
                    return localRes.json();
                }
                const errText = await localRes.text();
                throw new Error(errText || 'Failed to control campaign on local agent');
            }
        } catch (_) {
            // Fall back
        }
        return request<any>(`/campaigns/${campaignId}/control`, {
            method: 'POST',
            body: JSON.stringify({ action }),
        });
    },
    list: () => request<any>('/campaigns'),
    get: (id: string | number) => request<any>(`/campaigns/${id}`),
    delete: (id: string | number) =>
        request<any>(`/campaigns/${id}`, { method: 'DELETE' }),
    getLogs: (id: string | number) =>
        request<{ status: string; logs: any[] }>(`/campaigns/${id}/logs`),
    clearLogs: (id: string | number) =>
        request<{ status: string; message: string }>(`/campaigns/${id}/logs`, { method: 'DELETE' }),
};

// Account API
export const accountApi = {
    list: () => request<any>('/accounts'),
    create: (name: string, whatsappNumber: string) =>
        request<any>('/accounts', {
            method: 'POST',
            body: JSON.stringify({ name, whatsapp_number: whatsappNumber }),
        }),
    getQR: (id: string) => `/api/accounts/${id}/qr`, // Returns image URL, not JSON
    connect: async (id: string) => {
        try {
            const res = await fetch(`${AGENT_BASE}/status`);
            if (res.ok) {
                const localRes = await fetch(`${AGENT_BASE}/connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_id: id })
                });
                if (localRes.ok) {
                    return localRes.json();
                }
                const errText = await localRes.text();
                throw new Error(errText || 'Failed to connect account on local agent');
            }
        } catch (_) {
            // Fall back
        }
        return request<any>(`/accounts/${id}/connect`, { method: 'POST' });
    },
    delete: (id: string) =>
        request<any>(`/accounts/${id}`, { method: 'DELETE' }),
    getDiagnostics: (id: string | number) =>
        request<any>(`/accounts/${id}/diagnostics`),
};

// Contact API
export const contactApi = {
    list: () => request<any>('/contacts'),
    create: (data: any) =>
        request<any>('/contacts', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: string, data: any) =>
        request<any>(`/contacts/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        request<any>(`/contacts/${id}`, { method: 'DELETE' }),
    createBulk: (contacts: any[]) =>
        request<any>('/contacts/bulk', {
            method: 'POST',
            body: JSON.stringify({ contacts }),
        }),
};

// Group API
export const groupApi = {
    list: () => request<any>('/groups'),
    create: (name: string) =>
        request<any>('/groups', {
            method: 'POST',
            body: JSON.stringify({ name }),
        }),
    delete: (id: string) =>
        request<any>(`/groups/${id}`, { method: 'DELETE' }),
};

// Upload API
export const uploadApi = {
    getAttachmentFilename: () => request<any>('/attachment-filename'),
};

// Admin API
export const adminApi = {
    // Dashboard
    getStats: () => request<any>('/admin/stats'),
    getHealth: () => request<any>('/admin/health'),

    // Users
    listUsers: (params?: Record<string, string | number>) => {
        const qs = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return request<any>(`/admin/users${qs}`);
    },
    getUser: (id: number) => request<any>(`/admin/users/${id}`),
    createUser: (data: any) => request<any>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id: number, data: any) => request<any>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id: number) => request<any>(`/admin/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id: number, newPassword?: string) =>
        request<any>(`/admin/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password: newPassword || '' }) }),
    bulkUserAction: (data: any) => request<any>('/admin/users/bulk', { method: 'POST', body: JSON.stringify(data) }),

    // Errors
    listErrors: (params?: Record<string, string | number>) => {
        const qs = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return request<any>(`/admin/errors${qs}`);
    },
    resolveError: (id: number) => request<any>(`/admin/errors/${id}/resolve`, { method: 'POST' }),
    exportErrors: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<any>(`/admin/errors/export${qs}`);
    },
    getErrorStats: () => request<any>('/admin/errors/stats'),
    reportClientError: (data: any) => request<any>('/admin/errors/report', { method: 'POST', body: JSON.stringify(data) }),

    // Audit Logs
    listAuditLogs: (params?: Record<string, string | number>) => {
        const qs = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return request<any>(`/admin/audit-logs${qs}`);
    },
    exportAuditLogs: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<any>(`/admin/audit-logs/export${qs}`);
    },

    // Settings
    getSettings: (category?: string) => {
        const qs = category ? `?category=${encodeURIComponent(category)}` : '';
        return request<any>(`/admin/settings${qs}`);
    },
    updateSettings: (settings: any[]) =>
        request<any>('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),

    // Notifications
    listNotifications: (params?: Record<string, number>) => {
        const qs = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return request<any>(`/admin/notifications${qs}`);
    },
    createNotification: (data: any) =>
        request<any>('/admin/notifications', { method: 'POST', body: JSON.stringify(data) }),

    // Tasks
    listTasks: () => request<any>('/admin/tasks'),
    runTask: (id: number) => request<any>(`/admin/tasks/${id}/run`, { method: 'POST' }),

    // Reports
    getUserReport: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<any>(`/admin/reports/users${qs}`);
    },

    // Log Tail
    getLogTail: (params?: Record<string, string | number>) => {
        const qs = params ? '?' + new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)])
        ).toString() : '';
        return request<any>(`/admin/logs/tail${qs}`);
    },
};

// User Settings API
export const userSettingsApi = {
    getSettings: () => request<{ status: string; settings: any }>('/settings'),
    updateSettings: (settings: { theme?: string; palette?: string; global_placeholders?: any[] }) =>
        request<any>('/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        }),
};