import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { AdminNotification } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';

const AdminNotifications: React.FC = () => {
    const { showNotification } = useAppContext();
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [notifType, setNotifType] = useState('info');
    const [targetType, setTargetType] = useState('all');

    const fetchNotifications = useCallback(async () => {
        try {
            setLoading(true);
            const res = await adminApi.listNotifications({ page, per_page: 20 });
            setNotifications(res.notifications || []);
            setTotalPages(res.total_pages || 1);
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const handleSend = async () => {
        if (!title || !message) {
            showNotification({ message: 'Title and message required', type: 'warning' });
            return;
        }
        try {
            await adminApi.createNotification({ title, message, notification_type: notifType, target_type: targetType, target_users: [] });
            showNotification({ message: 'Notification sent!', type: 'success' });
            setShowCreate(false);
            setTitle(''); setMessage('');
            fetchNotifications();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const typeBadge = (t: string) => {
        const map: Record<string, string> = {
            info: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
            success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            error: 'bg-red-500/10 text-red-400 border-red-500/30',
        };
        return `px-2 py-0.5 rounded-full text-xs border ${map[t] || map.info}`;
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notification Center</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Broadcast messages to users</p>
                </div>
                <button onClick={() => setShowCreate(true)}
                    className="px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90">
                    + New Notification
                </button>
            </div>

            {/* Notification List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : notifications.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">No notifications sent yet</div>
                ) : notifications.map(n => (
                    <div key={n.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={typeBadge(n.notification_type)}>{n.notification_type}</span>
                                    <span className="text-xs text-gray-500">{n.target_type === 'all' ? 'All Users' : 'Specific Users'}</span>
                                    <span className="text-xs text-gray-500">• {new Date(n.created_at).toLocaleString()}</span>
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">{n.title}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{n.message}</p>
                            </div>
                            {n.is_sent && <span className="text-xs text-emerald-400">✓ Sent</span>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50">Prev</button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
                </div>
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">New Notification</h2>
                        <div className="space-y-3">
                            <input type="text" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                            <textarea placeholder="Message" value={message} onChange={e => setMessage(e.target.value)} rows={4}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
                            <select value={notifType} onChange={e => setNotifType(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                <option value="info">Info</option>
                                <option value="success">Success</option>
                                <option value="warning">Warning</option>
                                <option value="error">Error</option>
                            </select>
                            <select value={targetType} onChange={e => setTargetType(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                <option value="all">All Users</option>
                                <option value="specific">Specific Users</option>
                                <option value="role">By Role</option>
                            </select>
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button onClick={handleSend}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90">Send</button>
                            <button onClick={() => setShowCreate(false)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminNotifications;