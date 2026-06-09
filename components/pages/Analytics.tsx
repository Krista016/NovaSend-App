
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { useAppContext } from '../../hooks/useAppContext';
import { CampaignStatus } from '../../types';
import { DownloadIcon, ChevronDownIcon } from '../icons/Icons';

declare global {
  interface Window {
    XLSX: any;
  }
}

// --- MOCK DATA ---
const allAccountsMonthly = {
  performance: [
    { name: 'Jan', sent: 4000, success: 3950, failed: 50 }, { name: 'Feb', sent: 3000, success: 2950, failed: 50 },
    { name: 'Mar', sent: 2000, success: 1980, failed: 20 }, { name: 'Apr', sent: 2780, success: 2700, failed: 80 },
    { name: 'May', sent: 1890, success: 1850, failed: 40 }, { name: 'Jun', sent: 2390, success: 2300, failed: 90 },
  ],
  successRate: [
    { name: 'Jan', rate: 98.75 }, { name: 'Feb', rate: 98.33 }, { name: 'Mar', rate: 99.00 },
    { name: 'Apr', rate: 97.12 }, { name: 'May', rate: 97.88 }, { name: 'Jun', rate: 96.23 },
  ],
  kpis: { sent: '16.1k', success: '97.9%' },
  successFail: [{ name: 'Success', value: 15820 }, { name: 'Fail', value: 350 }],
};

const allAccountsWeekly = {
  performance: [
    { name: 'W1', sent: 620, success: 610, failed: 10 }, { name: 'W2', sent: 580, success: 575, failed: 5 },
    { name: 'W3', sent: 650, success: 640, failed: 10 }, { name: 'W4', sent: 540, success: 505, failed: 35 },
  ],
  successRate: [ { name: 'W1', rate: 98.3 }, { name: 'W2', rate: 99.1 }, { name: 'W3', rate: 98.4 }, { name: 'W4', rate: 93.5 },],
  kpis: { sent: '2.39k', success: '97.4%' },
  successFail: [{ name: 'Success', value: 2330 }, { name: 'Fail', value: 60 }],
};

const salesDeptData = { // Data for account '1'
  performance: [
    { name: 'Jan', sent: 2500, success: 2480, failed: 20 }, { name: 'Feb', sent: 1800, success: 1790, failed: 10 },
    { name: 'Mar', sent: 1200, success: 1190, failed: 10 }, { name: 'Apr', sent: 1500, success: 1480, failed: 20 },
  ],
  successRate: [ { name: 'Jan', rate: 99.2 }, { name: 'Feb', rate: 99.4 }, { name: 'Mar', rate: 99.1 }, { name: 'Apr', rate: 98.6 }, ],
  kpis: { sent: '7.0k', success: '99.1%' },
  successFail: [{ name: 'Success', value: 6940 }, { name: 'Fail', value: 60 }],
};

const supportLineData = { // Data for account '2'
  performance: [
    { name: 'Jan', sent: 1500, success: 1470, failed: 30 }, { name: 'Feb', sent: 1200, success: 1160, failed: 40 },
    { name: 'Mar', sent: 800, success: 790, failed: 10 }, { name: 'Apr', sent: 1280, success: 1220, failed: 60 },
  ],
  successRate: [ { name: 'Jan', rate: 98.0 }, { name: 'Feb', rate: 96.6 }, { name: 'Mar', rate: 98.7 }, { name: 'Apr', rate: 95.3 }, ],
  kpis: { sent: '4.78k', success: '97.1%' },
  successFail: [{ name: 'Success', value: 4640 }, { name: 'Fail', value: 140 }],
};

const campaignData = {
    'q4-blast': {
        performance: [{ name: 'Day 1', sent: 2500, success: 2450, failed: 50 }, { name: 'Day 2', sent: 2500, success: 2400, failed: 100 }],
        successRate: [{ name: 'Day 1', rate: 98.0 }, { name: 'Day 2', rate: 96.0 }],
        kpis: { sent: '5k', success: '97.0%' },
        successFail: [{ name: 'Success', value: 4850 }, { name: 'Fail', value: 150 }],
    },
    'new-year': {
        performance: [{ name: 'Hour 1', sent: 600, success: 590, failed: 10 }, { name: 'Hour 2', sent: 600, success: 585, failed: 15 }],
        successRate: [{ name: 'Hour 1', rate: 98.3 }, { name: 'Hour 2', rate: 97.5 }],
        kpis: { sent: '1.2k', success: '97.9%' },
        successFail: [{ name: 'Success', value: 1175 }, { name: 'Fail', value: 25 }],
    }
}

const COLORS = ['#00C49F', '#FF8042'];
const TooltipContentStyle = {
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
    borderColor: 'rgb(55 65 81)',
    color: '#ffffff',
    borderRadius: '0.5rem',
};

// Custom Dropdown Component
const CustomDropdown: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}> = ({ options, value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedLabel = options.find(opt => opt.value === value)?.label;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-10 px-4 py-2 flex items-center justify-between text-left bg-gray-100 dark:bg-gray-700/50 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600/50 transition"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate text-sm">{selectedLabel}</span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute mt-1 w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto" role="listbox">
          <ul className="p-1">
            {options.map(opt => (
              <li
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`px-3 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${value === opt.value ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold' : ''}`}
                role="option"
                aria-selected={value === opt.value}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// Custom Date Input Component
const DateInput: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const changeMonth = (delta: number) => {
    setCurrentDate(prev => {
        const newDate = new Date(prev);
        newDate.setMonth(newDate.getMonth() + delta);
        return newDate;
    });
  };

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const selectedDay = value ? new Date(value).getDate() : null;
  const selectedMonth = value ? new Date(value).getMonth() : null;
  const selectedYear = value ? new Date(value).getFullYear() : null;

  const handleSelectDate = (day: number) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const isoString = newDate.toISOString().split('T')[0];
    onChange(isoString);
    setIsOpen(false);
  };
  
  const formattedDate = value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'}) : 'mm/dd/yyyy';

  return (
    <div className="relative" ref={datePickerRef}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-32 h-10 text-sm px-4 py-2 bg-gray-100 dark:bg-gray-700/50 border border-transparent hover:border-gray-300 dark:hover:border-gray-600 rounded-lg text-left">
        {formattedDate}
      </button>
      {isOpen && (
        <div className="absolute mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex justify-between items-center mb-2">
            <button onClick={() => changeMonth(-1)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">&lt;</button>
            <span className="font-semibold">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => changeMonth(1)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">&gt;</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
            {blanks.map(b => <div key={`b-${b}`}></div>)}
            {days.map(day => {
                const isSelected = day === selectedDay && currentDate.getMonth() === selectedMonth && currentDate.getFullYear() === selectedYear;
                return (
                    <button key={day} onClick={() => handleSelectDate(day)} className={`w-8 h-8 rounded-full transition-colors ${isSelected ? 'bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                        {day}
                    </button>
                )
            })}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-sm">
            <button onClick={() => { onChange(''); setIsOpen(false); }} className="hover:text-[var(--gradient-via)]">Clear</button>
            <button onClick={() => handleSelectDate(new Date().getDate())} className="hover:text-[var(--gradient-via)]">Today</button>
          </div>
        </div>
      )}
    </div>
  );
};


const Analytics: React.FC = () => {
    const { accounts, showNotification } = useAppContext();
    const [timeframe, setTimeframe] = useState<'Weekly' | 'Monthly'>('Monthly');
    const [accountFilter, setAccountFilter] = useState<string>('all');
    const [campaignFilter, setCampaignFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [groupFilter, setGroupFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    const data = useMemo(() => {
        if (campaignFilter === 'q4-blast') return campaignData['q4-blast'];
        if (campaignFilter === 'new-year') return campaignData['new-year'];

        if (accountFilter === '1') return timeframe === 'Monthly' ? salesDeptData : { ...salesDeptData, performance: salesDeptData.performance.slice(0,2), successRate: salesDeptData.successRate.slice(0,2) };
        if (accountFilter === '2') return timeframe === 'Monthly' ? supportLineData : { ...supportLineData, performance: supportLineData.performance.slice(0,2), successRate: supportLineData.successRate.slice(0,2) };
        
        return timeframe === 'Monthly' ? allAccountsMonthly : allAccountsWeekly;
    }, [timeframe, accountFilter, campaignFilter, statusFilter, groupFilter]);

    const sentCount = useMemo(() => data.performance.reduce((acc, cur) => acc + cur.sent, 0).toLocaleString(), [data]);
    const failedCount = useMemo(() => data.performance.reduce((acc, cur) => acc + cur.failed, 0).toLocaleString(), [data]);
    
    const handleAccountChange = (value: string) => {
        setAccountFilter(value);
        setCampaignFilter('all'); 
    }

    const handleDownloadReport = () => {
        try {
            const XLSX = window.XLSX;
            if (!XLSX) {
                showNotification({ message: "Report download library could not be loaded.", type: 'error' });
                return;
            }
            const performanceSheet = XLSX.utils.json_to_sheet(data.performance);
            const ratePivotInstruction = ["Note: To create a Pivot Chart, select the data below (Ctrl+A), go to Insert > PivotChart, and set 'Period' as Axis and 'Success Rate (%)' as Values."];
            const ratePivotData = data.successRate.map(d => ({ Period: d.name, 'Success Rate (%)': d.rate }));
            const successRateSheet = XLSX.utils.json_to_sheet(ratePivotData, { origin: 'A2', skipHeader: true });
            XLSX.utils.sheet_add_aoa(successRateSheet, [ratePivotInstruction], { origin: 'A1' });
            XLSX.utils.sheet_add_aoa(successRateSheet, [Object.keys(ratePivotData[0])], { origin: 'A2' });
            successRateSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
            const failPivotInstruction = ["Note: To create a Pivot Table, select the data below, go to Insert > PivotTable. Use 'Period' for Rows, 'Category' for Columns, and 'Count' for Values."];
            const failPivotData = data.performance.flatMap(d => [{ Period: d.name, Category: 'Success', Count: d.success }, { Period: d.name, Category: 'Fail', Count: d.failed }]);
            const successFailSheet = XLSX.utils.json_to_sheet(failPivotData, { origin: 'A2', skipHeader: true });
            XLSX.utils.sheet_add_aoa(successFailSheet, [failPivotInstruction], { origin: 'A1' });
            XLSX.utils.sheet_add_aoa(successFailSheet, [Object.keys(failPivotData[0])], { origin: 'A2' });
            successFailSheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, performanceSheet, "Performance");
            XLSX.utils.book_append_sheet(workbook, successRateSheet, "Success Rate Trend");
            XLSX.utils.book_append_sheet(workbook, successFailSheet, "Success vs Fail Summary");

            XLSX.writeFile(workbook, "NovaSend_Analytics_Report.xlsx");
            showNotification({ message: "Report downloaded successfully.", type: 'success' });
        } catch (error) {
            console.error("Failed to download report:", error);
            showNotification({ message: "Failed to download report.", type: 'error' });
        }
    };
    
    const statusOptions = [{ value: "all", label: "All Statuses" }, ...Object.values(CampaignStatus).map(s => ({ value: s, label: s }))];
    const groupOptions = [{ value: "all", label: "All Groups" }, { value: "vip", label: "VIP Clients" }, { value: "new", label: "New Customers" }];
    const campaignOptions = [{ value: "all", label: "All Campaigns" }, { value: "q4-blast", label: "Q4 Holiday Blast" }, { value: "new-year", label: "New Year Promo" }];
    const accountOptions = [{ value: "all", label: "All Accounts" }, ...accounts.map(acc => ({ value: acc.id, label: acc.name }))];

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full md:w-fit">
                    <Card className="!px-4 !py-2">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Total Sent</p>
                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{data.kpis.sent}</p>
                    </Card>
                    <Card className="!px-4 !py-2">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Sent Messages</p>
                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{sentCount}</p>
                    </Card>
                    <Card className="!px-4 !py-2">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Failed to Send</p>
                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{failedCount}</p>
                    </Card>
                    <Card className="!px-4 !py-2">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Success Rate</p>
                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{data.kpis.success}</p>
                    </Card>
                </div>
                <div className="flex-shrink-0 w-full md:w-auto">
                    <Button id="download-report-btn" variant="primary" onClick={handleDownloadReport} icon={<DownloadIcon />} className="w-full">
                        Download Report
                    </Button>
                </div>
            </div>
            
            <Card title="Campaign Performance">
                <div className="flex flex-wrap lg:w-fit lg:flex-nowrap items-center justify-start gap-2 mb-4 pb-2">
                    <DateInput value={dateRange.start} onChange={val => setDateRange(prev => ({ ...prev, start: val }))} />
                    <span className="text-gray-500 flex-shrink-0">to</span>
                    <DateInput value={dateRange.end} onChange={val => setDateRange(prev => ({ ...prev, end: val }))} />
                    <div className="p-1 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                        <button onClick={() => setTimeframe('Weekly')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${timeframe === 'Weekly' ? 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>Weekly</button>
                        <button onClick={() => setTimeframe('Monthly')} className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${timeframe === 'Monthly' ? 'text-white bg-gradient-to-r from-[var(--gradient-from)] via-[var(--gradient-via)] to-[var(--gradient-to)]' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>Monthly</button>
                    </div>
                    <CustomDropdown options={statusOptions} value={statusFilter} onChange={setStatusFilter} className="w-full sm:w-36 flex-shrink-0"/>
                    <CustomDropdown options={groupOptions} value={groupFilter} onChange={setGroupFilter} className="w-full sm:w-44 flex-shrink-0"/>
                    <CustomDropdown options={campaignOptions} value={campaignFilter} onChange={setCampaignFilter} className="w-full sm:w-44 flex-shrink-0"/>
                    <CustomDropdown options={accountOptions} value={accountFilter} onChange={handleAccountChange} className="w-full sm:w-36 flex-shrink-0"/>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.performance}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                        <XAxis dataKey="name" stroke="rgb(156 163 175)" />
                        <YAxis stroke="rgb(156 163 175)" />
                        <Tooltip contentStyle={TooltipContentStyle} />
                        <Legend />
                        <Bar dataKey="sent" fill="var(--gradient-from)" radius={[4, 4, 0, 0]}/>
                        <Bar dataKey="success" fill="var(--gradient-to)" radius={[4, 4, 0, 0]}/>
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card title="Overall Success vs. Fail Rate">
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie data={data.successFail} cx="50%" cy="50%" labelLine={false} outerRadius={100} fill="#8884d8" dataKey="value" label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {data.successFail.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={TooltipContentStyle} />
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
                <Card title="Success Rate Trend">
                    <ResponsiveContainer width="100%" height={300}>
                         <LineChart data={data.successRate}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                            <XAxis dataKey="name" stroke="rgb(156 163 175)" />
                            <YAxis stroke="rgb(156 163 175)" domain={['dataMin - 2', 'dataMax + 1']} unit="%"/>
                            <Tooltip contentStyle={TooltipContentStyle} formatter={(value) => `${value}%`} />
                            <Legend />
                            <Line type="monotone" dataKey="rate" name="Success Rate" stroke="url(#colorRate)" strokeWidth={3} />
                             <defs>
                                <linearGradient id="colorRate" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="5%" stopColor="var(--gradient-from)" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="var(--gradient-to)" stopOpacity={0.8}/>
                                </linearGradient>
                            </defs>
                        </LineChart>
                    </ResponsiveContainer>
                </Card>
            </div>
        </div>
    );
};

export default Analytics;
