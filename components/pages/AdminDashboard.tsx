import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { AdminStats } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#ec4899'];

const AdminDashboard: React.FC = () => {
    const { setCurrentPage } = useAppContext();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [health, setHealth] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [statsRes, healthRes] = await Promise.all([
                adminApi.getStats(),
                adminApi.getHealth(),
            ]);
            setStats(statsRes.stats);
            setHealth(healthRes.health);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Failed to load admin data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[var(--gradient-from)]"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center">
                <div className="text-red-500 mb-4">{error}</div>
                <button onClick={fetchData} className="px-4 py-2 bg-[var(--gradient-from)] text-white rounded-lg hover:opacity-90">
                    Retry
                </button>
            </div>
        );
    }

    const healthBadge = health?.status === 'healthy'
        ? { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'No Issues Found' }
        : health?.status === 'critical'
        ? { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: `${health.critical_errors} Critical` }
        : { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: `${health?.unresolved_errors} Unresolved` };

    const userPieData = stats ? [
        { name: 'Active (24h)', value: stats.users.daily_active },
        { name: 'Inactive', value: stats.users.inactive },
        { name: 'New Today', value: stats.users.new_today },
    ].filter(d => d.value > 0) : [];

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
                <button onClick={fetchData} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    Refresh
                </button>
            </div>

            {/* Site Health Banner */}
            <div className={`flex items-center justify-between p-4 rounded-xl border ${healthBadge.bg} ${healthBadge.border}`}>
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${health?.status === 'healthy' ? 'bg-emerald-400' : health?.status === 'critical' ? 'bg-red-400' : 'bg-amber-400'} animate-pulse`} />
                    <span className={`font-semibold ${healthBadge.text}`}>{healthBadge.label}</span>
                    {health?.issues?.map((issue: string, i: number) => (
                        <span key={i} className="text-sm text-gray-500 dark:text-gray-400">• {issue}</span>
                    ))}
                </div>
                <button
                    onClick={() => setCurrentPage('AdminErrors')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${healthBadge.text} border ${healthBadge.border} hover:opacity-80 transition-opacity`}
                >
                    View Error Logs →
                </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Users" value={stats?.users.total || 0} icon="👥" color="blue" />
                <StatCard label="Active (24h)" value={stats?.users.daily_active || 0} icon="🟢" color="emerald" />
                <StatCard label="New Today" value={stats?.users.new_today || 0} icon="✨" color="purple" />
                <StatCard label="Inactive" value={stats?.users.inactive || 0} icon="💤" color="amber" />
                <StatCard label="Unresolved Errors" value={stats?.errors.unresolved || 0} icon="⚠️" color="red" />
                <StatCard label="Running Campaigns" value={stats?.campaigns.running || 0} icon="🚀" color="teal" />
                <StatCard label="Connected Accounts" value={stats?.accounts.connected || 0} icon="🔗" color="indigo" />
                <StatCard label="CPU Usage" value={`${stats?.server.cpu_percent || 0}%`} icon="💻" color="slate" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Registration Trend */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">New Registrations (7 Days)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={stats?.trends.registrations || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                            />
                            <Bar dataKey="count" fill="var(--gradient-from)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Error Trend */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Errors (7 Days)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={stats?.trends.errors || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                            />
                            <Line type="monotone" dataKey="count" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* User Distribution & Server Resources */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Distribution Pie */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">User Distribution</h3>
                    {userPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie data={userPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                    {userPieData.map((_, idx) => (
                                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-[250px] text-gray-400">No user data available</div>
                    )}
                    <div className="flex flex-wrap gap-3 justify-center mt-2">
                        {userPieData.map((d, idx) => (
                            <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                {d.name}: {d.value}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Server Resources */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Server Resources</h3>
                    <div className="space-y-4">
                        <ResourceBar label="CPU" percent={stats?.server.cpu_percent || 0} color="var(--gradient-from)" />
                        <ResourceBar label="Memory" percent={stats?.server.memory_percent || 0} color="var(--gradient-via)"
                            detail={`${stats?.server.memory_used_gb || 0} / ${stats?.server.memory_total_gb || 0} GB`} />
                        <ResourceBar label="Disk" percent={stats?.server.disk_percent || 0} color="var(--gradient-to)"
                            detail={`${stats?.server.disk_used_gb || 0} / ${stats?.server.disk_total_gb || 0} GB`} />
                    </div>
                </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <QuickLink label="User Management" icon="👥" onClick={() => setCurrentPage('AdminUsers')} />
                <QuickLink label="Error Logs" icon="🐛" onClick={() => setCurrentPage('AdminErrors')} />
                <QuickLink label="Audit Log" icon="📋" onClick={() => setCurrentPage('AdminAuditLog')} />
                <QuickLink label="System Settings" icon="⚙️" onClick={() => setCurrentPage('AdminSettings')} />
                <QuickLink label="Notifications" icon="🔔" onClick={() => setCurrentPage('AdminNotifications')} />
                <QuickLink label="Live Logs" icon="📡" onClick={() => setCurrentPage('AdminLogTail')} />
                <QuickLink label="Tasks" icon="⏰" onClick={() => setCurrentPage('AdminTasks')} />
                <QuickLink label="Reports" icon="📊" onClick={() => setCurrentPage('AdminReports')} />
            </div>
        </div>
    );
};

const StatCard: React.FC<{ label: string; value: number | string; icon: string; color: string }> = ({ label, value, icon, color }) => {
    const colorMap: Record<string, string> = {
        blue: 'border-blue-500/30 bg-blue-500/5',
        emerald: 'border-emerald-500/30 bg-emerald-500/5',
        purple: 'border-purple-500/30 bg-purple-500/5',
        amber: 'border-amber-500/30 bg-amber-500/5',
        red: 'border-red-500/30 bg-red-500/5',
        teal: 'border-teal-500/30 bg-teal-500/5',
        indigo: 'border-indigo-500/30 bg-indigo-500/5',
        slate: 'border-slate-500/30 bg-slate-500/5',
    };
    return (
        <div className={`rounded-xl p-4 border ${colorMap[color] || colorMap.blue}`}>
            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
                <span className="text-xl">{icon}</span>
            </div>
            <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{value}</div>
        </div>
    );
};

const ResourceBar: React.FC<{ label: string; percent: number; color: string; detail?: string }> = ({ label, percent, color, detail }) => (
    <div>
        <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <span className="text-gray-900 dark:text-white font-medium">{percent}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
        </div>
        {detail && <div className="text-xs text-gray-400 mt-1">{detail}</div>}
    </div>
);

const QuickLink: React.FC<{ label: string; icon: string; onClick: () => void }> = ({ label, icon, onClick }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
    >
        <span className="text-lg">{icon}</span>
        {label}
    </button>
);

export default AdminDashboard;