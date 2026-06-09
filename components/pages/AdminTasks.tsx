import React, { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import type { ScheduledTask } from '../../types';
import { useAppContext } from '../../hooks/useAppContext';

const AdminTasks: React.FC = () => {
    const { showNotification } = useAppContext();
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);

    const fetchTasks = useCallback(async () => {
        try {
            setLoading(true);
            const res = await adminApi.listTasks();
            setTasks(res.tasks || []);
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    const handleRunTask = async (taskId: number) => {
        try {
            const res = await adminApi.runTask(taskId);
            showNotification({ message: `Task "${res.task.name}" completed`, type: 'success' });
            fetchTasks();
        } catch (e: any) {
            showNotification({ message: `Failed: ${e.message}`, type: 'error' });
        }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            idle: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
            running: 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse',
            completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            failed: 'bg-red-500/10 text-red-400 border-red-500/30',
        };
        return `px-2 py-0.5 rounded-full text-xs border ${map[status] || map.idle}`;
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scheduled Tasks</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Background job monitoring and management</p>
                </div>
                <button onClick={fetchTasks}
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    Refresh
                </button>
            </div>

            {/* Tasks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {loading ? (
                    <div className="col-span-2 text-center py-8 text-gray-400">Loading...</div>
                ) : tasks.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-gray-400">
                        No scheduled tasks configured.
                        <p className="text-xs mt-1">Tasks are created automatically by the system for background jobs like email sending, report generation, and data cleanup.</p>
                    </div>
                ) : tasks.map(task => (
                    <div key={task.id} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">{task.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={statusBadge(task.status)}>{task.status}</span>
                                    {task.cron_expression && (
                                        <span className="text-xs text-gray-500 font-mono">{task.cron_expression}</span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => handleRunTask(task.id)}
                                disabled={task.status === 'running'}
                                className="px-3 py-1.5 text-xs bg-[var(--gradient-from)] text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                                Run Now
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                            <div>Last Run: {task.last_run ? new Date(task.last_run).toLocaleString() : 'Never'}</div>
                            <div>Next Run: {task.next_run ? new Date(task.next_run).toLocaleString() : 'N/A'}</div>
                        </div>
                        {task.logs && task.logs.length > 0 && (
                            <button onClick={() => setSelectedTask(task)}
                                className="mt-3 text-xs text-[var(--gradient-from)] hover:underline">
                                View logs ({task.logs.length} entries)
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Task Logs Modal */}
            {selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedTask(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{selectedTask.name} - Logs</h2>
                        <div className="space-y-1 max-h-96 overflow-y-auto bg-gray-900 rounded-lg p-3 font-mono text-xs">
                            {selectedTask.logs.map((log, i) => (
                                <div key={i} className="flex gap-2 py-0.5">
                                    <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARNING' ? 'text-amber-400' : 'text-blue-400'}>[{log.level}]</span>
                                    <span className="text-gray-300">{log.message}</span>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setSelectedTask(null)}
                            className="mt-4 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTasks;