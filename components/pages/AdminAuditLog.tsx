import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { AuditLogEntry } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';

const AdminAuditLog: React.FC = () => {
    const { showNotification } = useAppContext();
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('');
    const [targetFilter, setTargetFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const params: Record<string, string | number> = { page, per_page: 25 };
            if (search) params.search = search;
            if (actionFilter) params.action = actionFilter;
            if (targetFilter) params.target_type = targetFilter;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.listAuditLogs(params);
            setLogs(res.logs || []);
            setTotal(res.total || 0);
            setTotalPages(res.total_pages || 1);
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page, search, actionFilter, targetFilter, dateFrom, dateTo]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const handleExport = async (format: string) => {
        try {
            const params: Record<string, string> = { format };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.exportAuditLogs(params);
            const content = format === 'csv' ? res.data : JSON.stringify(res.data, null, 2);
            const mime = format === 'csv' ? 'text/csv' : 'application/json';
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = res.filename || `audit.${format}`; a.click();
            URL.revokeObjectURL(url);
            showNotification({ message: 'Export downloaded', type: 'success' });
        } catch (e: any) {
            showNotification({ message: `Export failed: ${e.message}`, type: 'error' });
        }
    };

    const actionBadge = (action: string) => {
        if (action.includes('delete')) return 'bg-red-500/10 text-red-400 border-red-500/30';
        if (action.includes('reset') || action.includes('suspend') || action.includes('ban')) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        if (action.includes('create')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{total} total entries</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => handleExport('json')} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Export JSON</button>
                    <button onClick={() => handleExport('csv')} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Export CSV</button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
                <input type="text" placeholder="Search admin, action, details..." value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">All Actions</option>
                    <option value="user_deleted">User Deleted</option>
                    <option value="user_created">User Created</option>
                    <option value="user_updated">User Updated</option>
                    <option value="password_reset">Password Reset</option>
                    <option value="users_suspended">Users Suspended</option>
                    <option value="users_banned">Users Banned</option>
                    <option value="settings_updated">Settings Updated</option>
                    <option value="notification_sent">Notification Sent</option>
                    <option value="error_resolved">Error Resolved</option>
                </select>
                <select value={targetFilter} onChange={e => { setTargetFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">All Targets</option>
                    <option value="user">User</option>
                    <option value="setting">Setting</option>
                    <option value="error_log">Error Log</option>
                    <option value="notification">Notification</option>
                    <option value="scheduled_task">Task</option>
                </select>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
            </div>

            {/* Log Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Timestamp</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Admin</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Action</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Target</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">IP</th>
                                <th className="p-3 text-right text-gray-500 dark:text-gray-400 font-medium">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No audit logs found</td></tr>
                            ) : logs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="p-3 text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                                    <td className="p-3 text-gray-900 dark:text-white">{log.admin_email}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs border ${actionBadge(log.action)}`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="p-3 text-xs text-gray-500">
                                        {log.target_type}{log.target_id ? ` #${log.target_id}` : ''}
                                    </td>
                                    <td className="p-3 text-xs text-gray-500 font-mono">{log.ip_address || '-'}</td>
                                    <td className="p-3 text-right">
                                        <button onClick={() => setSelectedLog(log)}
                                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                            className="px-3 py-1 text-sm border rounded disabled:opacity-50">Prev</button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                            className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedLog(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-200 dark:border-gray-700 shadow-xl"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Audit Entry Detail</h2>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">ID</span><span className="text-gray-900 dark:text-white">{selectedLog.id}</span></div>
                            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">Timestamp</span><span className="text-gray-900 dark:text-white">{new Date(selectedLog.timestamp).toLocaleString()}</span></div>
                            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">Admin</span><span className="text-gray-900 dark:text-white">{selectedLog.admin_email} (ID: {selectedLog.admin_id})</span></div>
                            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">Action</span><span className="text-gray-900 dark:text-white">{selectedLog.action}</span></div>
                            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">Target</span><span className="text-gray-900 dark:text-white">{selectedLog.target_type} #{selectedLog.target_id || 'N/A'}</span></div>
                            <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700"><span className="text-gray-500">IP Address</span><span className="text-gray-900 dark:text-white font-mono">{selectedLog.ip_address || 'N/A'}</span></div>
                            {Object.keys(selectedLog.details || {}).length > 0 && (
                                <div>
                                    <span className="text-gray-500">Details:</span>
                                    <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs overflow-x-auto">{JSON.stringify(selectedLog.details, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setSelectedLog(null)}
                            className="mt-4 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminAuditLog;