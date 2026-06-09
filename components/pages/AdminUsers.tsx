import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { AdminUser } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';

const AdminUsers: React.FC = () => {
    const { showNotification } = useAppContext();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');
    const [statusFilter, setStatusFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState<AdminUser | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<AdminUser | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState<AdminUser | null>(null);
    const [resetResult, setResetResult] = useState<string | null>(null);
    const [detailResetResult, setDetailResetResult] = useState<string | null>(null);

    // Create form state
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('user');
    const [newStatus, setNewStatus] = useState('active');

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const params: Record<string, string | number> = { page, per_page: 20, sort_by: sortBy, sort_order: sortOrder };
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;
            if (roleFilter) params.role = roleFilter;
            const res = await adminApi.listUsers(params);
            setUsers(res.users || []);
            setTotal(res.total || 0);
            setTotalPages(res.total_pages || 1);
        } catch (e: any) {
            showNotification({ message: `Failed to load users: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page, search, sortBy, sortOrder, statusFilter, roleFilter]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const handleCreateUser = async () => {
        if (!newEmail || !newPassword || !newName) {
            showNotification({ message: 'All fields are required', type: 'warning' });
            return;
        }
        try {
            await adminApi.createUser({ email: newEmail, password: newPassword, name: newName, role: newRole, account_status: newStatus });
            showNotification({ message: 'User created successfully', type: 'success' });
            setShowCreateModal(false);
            setNewEmail(''); setNewPassword(''); setNewName('');
            fetchUsers();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const handleDeleteUser = async () => {
        if (!showDeleteConfirm) return;
        try {
            await adminApi.deleteUser(showDeleteConfirm.id);
            showNotification({ message: `User ${showDeleteConfirm.email} deleted`, type: 'success' });
            setShowDeleteConfirm(null);
            fetchUsers();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const handleResetPassword = async () => {
        if (!showResetConfirm) return;
        try {
            const res = await adminApi.resetPassword(showResetConfirm.id);
            setResetResult(res.temporary_password);
            showNotification({ message: 'Password reset successfully', type: 'success' });
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const handleBulkAction = async (action: string) => {
        if (selectedIds.size === 0) {
            showNotification({ message: 'No users selected', type: 'warning' });
            return;
        }
        if (action === 'delete' && !window.confirm(`Delete ${selectedIds.size} users permanently?`)) return;
        try {
            const res = await adminApi.bulkUserAction({ action, user_ids: Array.from(selectedIds) });
            if (action === 'export' && res.export_data) {
                const blob = new Blob([JSON.stringify(res.export_data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'users_export.json'; a.click();
                URL.revokeObjectURL(url);
            }
            showNotification({ message: res.message || `Action "${action}" completed`, type: 'success' });
            setSelectedIds(new Set());
            fetchUsers();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === users.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(users.map(u => u.id)));
        }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            banned: 'bg-red-500/10 text-red-400 border-red-500/30',
        };
        return `px-2 py-0.5 rounded-full text-xs border ${map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30'}`;
    };

    const roleBadge = (role: string) => {
        const map: Record<string, string> = {
            super_admin: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
            admin: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
            support: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
            auditor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
            user: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
        };
        return `px-2 py-0.5 rounded-full text-xs border ${map[role] || map.user}`;
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{total} total users</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                    + Create User
                </button>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-wrap gap-3 items-center">
                <input
                    type="text" placeholder="Search by email or name..."
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                </select>
                <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
                    <option value="">All Roles</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="support">Support</option>
                    <option value="auditor">Auditor</option>
                    <option value="user">User</option>
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
                    <option value="created_at">Created</option>
                    <option value="email">Email</option>
                    <option value="name">Name</option>
                    <option value="last_login_at">Last Login</option>
                </select>
                <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <span className="text-sm text-blue-400">{selectedIds.size} selected</span>
                    <button onClick={() => handleBulkAction('suspend')} className="px-3 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-md hover:bg-amber-500/30">Suspend</button>
                    <button onClick={() => handleBulkAction('activate')} className="px-3 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded-md hover:bg-emerald-500/30">Activate</button>
                    <button onClick={() => handleBulkAction('ban')} className="px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30">Ban</button>
                    <button onClick={() => handleBulkAction('export')} className="px-3 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-md hover:bg-blue-500/30">Export</button>
                    <button onClick={() => handleBulkAction('delete')} className="px-3 py-1 text-xs bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 ml-auto">Delete</button>
                </div>
            )}

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="p-3 text-left">
                                    <input type="checkbox" checked={selectedIds.size === users.length && users.length > 0}
                                        onChange={toggleSelectAll} className="rounded" />
                                </th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">User</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Role</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Status</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Plan</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Last Login</th>
                                <th className="p-3 text-left text-gray-500 dark:text-gray-400 font-medium">Created</th>
                                <th className="p-3 text-right text-gray-500 dark:text-gray-400 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading...</td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No users found</td></tr>
                            ) : users.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <td className="p-3">
                                        <input type="checkbox" checked={selectedIds.has(u.id)}
                                            onChange={() => toggleSelect(u.id)} className="rounded" />
                                    </td>
                                    <td className="p-3">
                                        <button onClick={() => setShowDetailModal(u)} className="text-left hover:text-[var(--gradient-from)] transition-colors">
                                            <div className="font-medium text-gray-900 dark:text-white">{u.name}</div>
                                            <div className="text-xs text-gray-500">{u.email}</div>
                                        </button>
                                    </td>
                                    <td className="p-3">
                                        <select
                                            value={u.role}
                                            onChange={async (e) => {
                                                const newRole = e.target.value;
                                                try {
                                                    await adminApi.updateUser(u.id, { role: newRole });
                                                    showNotification({ message: `Role updated to ${newRole}`, type: 'success' });
                                                    fetchUsers();
                                                } catch (err: any) {
                                                    showNotification({ message: `Failed: ${err.message}`, type: 'error' });
                                                }
                                            }}
                                            className={`text-xs px-2 py-1 rounded border ${roleBadge(u.role)} bg-transparent cursor-pointer`}
                                        >
                                            <option value="user" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">user</option>
                                            <option value="admin" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">admin</option>
                                            <option value="support" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">support</option>
                                            <option value="auditor" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">auditor</option>
                                            <option value="super_admin" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">super_admin</option>
                                        </select>
                                    </td>
                                    <td className="p-3"><span className={statusBadge(u.account_status)}>{u.account_status}</span></td>
                                    <td className="p-3 text-gray-600 dark:text-gray-400">{u.plan}</td>
                                    <td className="p-3 text-gray-500 text-xs">
                                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td className="p-3 text-gray-500 text-xs">
                                        {new Date(u.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex gap-1 justify-end">
                                            <button onClick={() => setShowDetailModal(u)}
                                                className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">View</button>
                                            <button onClick={() => setShowResetConfirm(u)}
                                                className="px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded hover:bg-amber-200">Reset Password</button>
                                            <button onClick={() => setShowDeleteConfirm(u)}
                                                className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination */}
                <div className="flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50">Prev</button>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50">Next</button>
                    </div>
                </div>
            </div>

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Create New User</h2>
                        <div className="space-y-3">
                            <input type="text" placeholder="Full Name" value={newName} onChange={e => setNewName(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                            <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                            <div className="relative">
                                <input type={showNewPassword ? 'text' : 'password'} placeholder="Password (min 6 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">
                                    {showNewPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                            <select value={newRole} onChange={e => setNewRole(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                                <option value="support">Support</option>
                                <option value="auditor">Auditor</option>
                                <option value="super_admin">Super Admin</option>
                            </select>
                            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button onClick={handleCreateUser}
                                className="flex-1 px-4 py-2 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-via)] text-white rounded-lg hover:opacity-90">Create</button>
                            <button onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {showDetailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDetailModal(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-200 dark:border-gray-700 shadow-xl max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">User Profile</h2>
                        <div className="space-y-2 text-sm">
                            <DetailRow label="ID" value={showDetailModal.id} />
                            <DetailRow label="Name" value={showDetailModal.name} />
                            <DetailRow label="Email" value={showDetailModal.email} />
                            <DetailRow label="Role" value={showDetailModal.role} />
                            <DetailRow label="Status" value={showDetailModal.account_status} />
                            <DetailRow label="Plan" value={showDetailModal.plan} />
                            <DetailRow label="Created" value={new Date(showDetailModal.created_at).toLocaleString()} />
                            <DetailRow label="Last Login" value={showDetailModal.last_login_at ? new Date(showDetailModal.last_login_at).toLocaleString() : 'Never'} />
                        </div>

                        {/* Password Reset Section in Detail Modal */}
                        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-300 mb-2">Password Management</h3>
                            <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Passwords are stored securely and cannot be viewed. You can reset the password below.</p>
                            {detailResetResult ? (
                                <div className="p-3 bg-white dark:bg-gray-700 rounded-lg border border-amber-300 dark:border-amber-600">
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">New temporary password:</p>
                                    <code className="text-sm font-mono text-amber-800 dark:text-amber-200 break-all bg-amber-100 dark:bg-amber-900/50 px-2 py-1 rounded">{detailResetResult}</code>
                                </div>
                            ) : (
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await adminApi.resetPassword(showDetailModal.id);
                                            setDetailResetResult(res.temporary_password);
                                            showNotification({ message: 'Password reset', type: 'success' });
                                        } catch (e: any) {
                                            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
                                        }
                                    }}
                                    className="w-full px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium"
                                >
                                    Reset Password & Show Temporary
                                </button>
                            )}
                        </div>

                        {showDetailModal.login_history && showDetailModal.login_history.length > 0 && (
                            <div className="mt-4">
                                <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Login History</h3>
                                <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {showDetailModal.login_history.slice(0, 10).map((entry, i) => (
                                        <div key={i} className="text-xs text-gray-500 flex justify-between">
                                            <span>{new Date(entry.timestamp).toLocaleString()}</span>
                                            <span>{entry.ip}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button onClick={() => { setShowDetailModal(null); setDetailResetResult(null); }}
                            className="mt-4 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Close</button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-200 dark:border-gray-700 shadow-xl"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-2 text-red-500">Delete User</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Permanently delete <strong>{showDeleteConfirm.email}</strong>? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={handleDeleteUser}
                                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Delete</button>
                            <button onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowResetConfirm(null); setResetResult(null); }}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm border border-gray-200 dark:border-gray-700 shadow-xl"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-2 text-amber-500">Reset Password</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Reset password for <strong>{showResetConfirm.email}</strong>?
                        </p>
                        {resetResult ? (
                            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                                <p className="text-xs text-amber-400 mb-1">Temporary Password:</p>
                                <code className="text-sm font-mono text-amber-300 break-all">{resetResult}</code>
                            </div>
                        ) : (
                            <div className="flex gap-3">
                                <button onClick={handleResetPassword}
                                    className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">Reset</button>
                                <button onClick={() => setShowResetConfirm(null)}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Cancel</button>
                            </div>
                        )}
                        {resetResult && (
                            <button onClick={() => { setShowResetConfirm(null); setResetResult(null); }}
                                className="mt-3 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Close</button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const DetailRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-900 dark:text-white font-medium">{value}</span>
    </div>
);

export default AdminUsers;