import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi } from '../../services/api';
import { useAppContext } from '../../hooks/useAppContext';

const AdminLogTail: React.FC = () => {
    const { showNotification } = useAppContext();
    const [logs, setLogs] = useState<any[]>([]);
    const [levelFilter, setLevelFilter] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(async () => {
        try {
            const params: Record<string, string | number> = { limit: 100 };
            if (levelFilter) params.level = levelFilter;
            const res = await adminApi.getLogTail(params);
            setLogs(res.logs || []);
        } catch {}
    }, [levelFilter]);

    useEffect(() => {
        fetchLogs();
        if (isPaused) return;
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [fetchLogs, isPaused]);

    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const levelColor = (level: string) => {
        switch (level?.toUpperCase()) {
            case 'ERROR': return 'text-red-400';
            case 'WARNING': return 'text-amber-400';
            case 'CRITICAL': return 'text-red-500 font-bold';
            case 'DEBUG': return 'text-gray-500';
            default: return 'text-blue-400';
        }
    };

    return (
        <div className="p-6 space-y-4 overflow-y-auto h-full flex flex-col">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Log Tail</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Real-time system log stream</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                        <option value="">All Levels</option>
                        <option value="ERROR">Error</option>
                        <option value="WARNING">Warning</option>
                        <option value="INFO">Info</option>
                        <option value="DEBUG">Debug</option>
                    </select>
                    <button onClick={() => setIsPaused(!isPaused)}
                        className={`px-3 py-2 rounded-lg text-sm border ${isPaused ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'border-gray-300 dark:border-gray-600'}`}>
                        {isPaused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                    <button onClick={() => setAutoScroll(!autoScroll)}
                        className={`px-3 py-2 rounded-lg text-sm border ${autoScroll ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'border-gray-300 dark:border-gray-600'}`}>
                        {autoScroll ? 'Auto-Scroll ON' : 'Auto-Scroll OFF'}
                    </button>
                </div>
            </div>

            {/* Log Console */}
            <div ref={containerRef}
                className="flex-1 bg-gray-900 rounded-xl border border-gray-700 p-4 font-mono text-xs overflow-y-auto min-h-[400px]"
                style={{ maxHeight: 'calc(100vh - 250px)' }}>
                {logs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">No log entries</div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="flex gap-3 py-0.5 hover:bg-gray-800/50 px-1 rounded">
                            <span className="text-gray-500 shrink-0">{log.timestamp}</span>
                            <span className={`shrink-0 w-16 ${levelColor(log.level)}`}>[{log.level}]</span>
                            <span className="text-gray-300 break-all">{log.message}</span>
                        </div>
                    ))
                )}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 shrink-0">
                <span>{logs.length} entries displayed</span>
                <span>{isPaused ? 'Paused' : 'Live • updating every 2s'}</span>
            </div>
        </div>
    );
};

export default AdminLogTail;