import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { ErrorLogEntry } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';

const AdminErrors: React.FC = () => {
    const { showNotification } = useAppContext();
    const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [levelFilter, setLevelFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [resolvedFilter, setResolvedFilter] = useState('false');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedError, setSelectedError] = useState<ErrorLogEntry | null>(null);
    const [errorStats, setErrorStats] = useState<any>(null);

    const fetchErrors = useCallback(async () => {
        try {
            setLoading(true);
            const params: Record<string, string | number> = { page, per_page: 25 };
            if (levelFilter) params.level = levelFilter;
            if (typeFilter) params.error_type = typeFilter;
            if (sourceFilter) params.source = sourceFilter;
            if (resolvedFilter) params.resolved = resolvedFilter;
            if (search) params.search = search;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.listErrors(params);
            setErrors(res.errors || []);
            setTotal(res.total || 0);
            setTotalPages(res.total_pages || 1);
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page, levelFilter, typeFilter, sourceFilter, resolvedFilter, search, dateFrom, dateTo]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await adminApi.getErrorStats();
            setErrorStats(res.stats);
        } catch {}
    }, []);

    useEffect(() => { fetchErrors(); fetchStats(); }, [fetchErrors]);

    const handleResolve = async (id: number) => {
        try {
            await adminApi.resolveError(id);
            showNotification({ message: 'Error marked as resolved', type: 'success' });
            fetchErrors();
            fetchStats();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const handleExport = async (format: string) => {
        try {
            const params: Record<string, string> = { format };
            if (levelFilter) params.level = levelFilter;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await adminApi.exportErrors(params);
            const content = format === 'csv' ? res.data : JSON.stringify(res.data, null, 2);
            const mime = format === 'csv' ? 'text/csv' : 'application/json';
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = res.filename || `errors.${format}`; a.click();
            URL.revokeObjectURL(url);
            showNotification({ message: 'Export downloaded', type: 'success' });
        } catch (e: any) {
            showNotification({ message: `Export failed: ${e.message}`, type: 'error' });
        }
    };

    const levelBadge = (level: string) => {
        const map: Record<string, string> = {
            CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/30',
            ERROR: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
            WARNING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            INFO: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        };
        return `px-2 py-0.5 rounded-full text-xs border ${map[level] || map.INFO}`;
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Error Logs</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{total} total entries</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => handleExport('json')} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Export JSON</button>
                    <button onClick={() => handleExport('csv')} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Export CSV</button>
                </div>
            </div>

            {/* Error Stats Summary */}
            {errorStats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <StatBadge label="Total" value={errorStats.total} color="slate" />
                    <StatBadge label="Unresolved" value={errorStats.unresolved} color="amber" />
                    <StatBadge label="Critical" value={errorStats.critical} color="red" />
                    <StatBadge label="Errors" value={errorStats.errors} color="orange" />
                    <StatBadge label="Warnings" value={errorStats.warnings} color="yellow" />
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
                <input type="text" placeholder="Search messages..." value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                <select value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">All Levels</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="ERROR">Error</option>
                    <option value="WARNING">Warning</option>
                    <option value="INFO">Info</option>
                </select>
                <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="">All Sources</option>
                    <option value="server">Server</option>
                    <option value="client">Client</option>
                </select>
                <select value={resolvedFilter} onChange={e => { setResolvedFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                    <option value="false">Unresolved</option>
                    <option value="true">Resolved</option>
                    <option value="">All</option>
                </select>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm" />
            </div>

            {/* Error List */}
            <div className="space-y-2">
                {loading ? (
                    <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : errors.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">No errors found</div>
                ) : errors.map(e => (
                    <div key={e.id}
                        className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                            e.resolved ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60' :
                            'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-[var(--gradient-from)]'
                        }`}
                        onClick={() => setSelectedError(e)}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={levelBadge(e.level)}>{e.level}</span>
                                    <span className="text-xs text-gray-500">{e.error_type}</span>
                                    <span className="text-xs text-gray-500">• {e.source}</span>
                                    <span className="text-xs text-gray-500">• {new Date(e.timestamp).toLocaleString()}</span>
                                    {e.resolved && <span className="text-xs text-emerald-400">✓ Resolved</span>}
                                </div>
                                <p className="text-sm text-gray-900 dark:text-white truncate">{e.message}</p>
                                {e.user_email && <span className="text-xs text-gray-500">User: {e.user_email}</span>}
                            </div>
                            {!e.resolved && (
                                <button onClick={(ev) => { ev.stopPropagation(); handleResolve(e.id); }}
                                    className="shrink-0 px-3 py-1 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20">
                                    Resolve
                                </button>
                            )}
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

            {/* Error Detail Modal */}
            {selectedError && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedError(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-h-[85vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Error Detail</h2>
                            <span className={levelBadge(selectedError.level)}>{selectedError.level}</span>
                        </div>
                        <div className="space-y-3 text-sm">
                            <DetailRow label="ID" value={selectedError.id} />
                            <DetailRow label="Timestamp" value={new Date(selectedError.timestamp).toLocaleString()} />
                            <DetailRow label="Type" value={selectedError.error_type} />
                            <DetailRow label="Source" value={selectedError.source} />
                            <DetailRow label="User" value={selectedError.user_email || 'N/A'} />
                            <DetailRow label="URL" value={selectedError.url || 'N/A'} />
                            <DetailRow label="Resolved" value={selectedError.resolved ? 'Yes' : 'No'} />
                            <div>
                                <span className="text-gray-500">Message:</span>
                                <p className="mt-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white">{selectedError.message}</p>
                            </div>
                            {selectedError.stack_trace && (
                                <div>
                                    <span className="text-gray-500">Stack Trace:</span>
                                    <pre className="mt-1 p-3 bg-gray-900 text-gray-300 rounded-lg text-xs overflow-x-auto max-h-60">{selectedError.stack_trace}</pre>
                                </div>
                            )}
                            {Object.keys(selectedError.context_data || {}).length > 0 && (
                                <div>
                                    <span className="text-gray-500">Context:</span>
                                    <pre className="mt-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs overflow-x-auto">
                                        {JSON.stringify(selectedError.context_data, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 mt-4">
                            {!selectedError.resolved && (
                                <button onClick={() => { handleResolve(selectedError.id); setSelectedError(null); }}
                                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Mark Resolved</button>
                            )}
                            <button onClick={() => setSelectedError(null)}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatBadge: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
    const colors: Record<string, string> = {
        slate: 'border-slate-500/30 bg-slate-500/5', amber: 'border-amber-500/30 bg-amber-500/5',
        red: 'border-red-500/30 bg-red-500/5', orange: 'border-orange-500/30 bg-orange-500/5',
        yellow: 'border-yellow-500/30 bg-yellow-500/5',
    };
    return (
        <div className={`rounded-xl p-3 border ${colors[color] || colors.slate}`}>
            <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
        </div>
    );
};

const DetailRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-900 dark:text-white font-medium">{value}</span>
    </div>
);

export default AdminErrors;