/* eslint-disable sonarjs/deprecation, @typescript-eslint/no-deprecated */
import React, { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ActivityLog } from '../hooks/useActivities';
import { Cron } from '../hooks/useNotifications';

const CATEGORY_COLORS: Record<string, string> = {
  'Fitness': '#3b82f6',
  'Nutrition': '#f59e0b',
  'Mindfulness': '#8b5cf6',
  'Health': '#10b981',
  'Sleep': '#6366f1',
  'Custom': 'var(--accent-color)'
};

const getCategoryColor = (category: string) => CATEGORY_COLORS[category] || CATEGORY_COLORS['Custom'];

const getRoutineColor = (cronId: string) => {
  let hash = 0;
  for (let i = 0; i < cronId.length; i++) hash = cronId.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
};

const filterLogsByDays = (logs: ActivityLog[], days: number | null) => {
  if (!days) return logs;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return logs.filter(l => l.logged_at && new Date(l.logged_at) >= cutoff);
};

const getTrendData = (logs: ActivityLog[]) => {
  const counts: Record<string, number> = {};
  logs.forEach(l => {
    if (!l.logged_at) return;
    const date = new Date(l.logged_at).toLocaleDateString();
    counts[date] = (counts[date] || 0) + 1;
  });
  return Object.keys(counts).map(date => ({ date, count: counts[date] || 0 })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const getCategoryDistributionData = (logs: ActivityLog[], crons: Cron[]) => {
  const counts: Record<string, number> = {};
  logs.forEach(l => {
    const cron = crons.find(c => c.cron_id === l.cron_id);
    const cat = cron?.category || 'Custom';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.keys(counts).map(category => ({ name: category, value: counts[category] || 0, fill: getCategoryColor(category) })).sort((a, b) => b.value - a.value);
};

const getRoutineDistributionData = (logs: ActivityLog[], crons: Cron[]) => {
  const counts: Record<string, number> = {};
  const fills: Record<string, string> = {};
  logs.forEach(l => {
    const title = l.activity_title || 'Unknown';
    counts[title] = (counts[title] || 0) + 1;
    if (!fills[title]) {
      const cron = crons.find(c => c.cron_id === l.cron_id);
      fills[title] = getCategoryColor(cron?.category || 'Custom') || 'var(--accent-color)';
    }
  });
  return Object.keys(counts).map(title => ({ title, count: counts[title] || 0, fill: fills[title] })).sort((a, b) => b.count - a.count).slice(0, 5);
};

const getCategoryRoutineDistributionData = (logs: ActivityLog[]) => {
  const counts: Record<string, number> = {};
  const fills: Record<string, string> = {};
  logs.forEach(l => {
    const title = l.activity_title || 'Unknown';
    counts[title] = (counts[title] || 0) + 1;
    if (!fills[title]) {
      fills[title] = getRoutineColor(l.cron_id);
    }
  });
  return Object.keys(counts).map(title => ({ title, count: counts[title] || 0, fill: fills[title] })).sort((a, b) => b.count - a.count).slice(0, 5);
};

const KPICards = ({ title1, val1, title2, val2 }: any) => (
  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
    <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{title1}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{val1}</div>
    </div>
    <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{title2}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val2}</div>
    </div>
  </div>
);

const ChartCard = ({ title, children }: { readonly title: string; readonly children: React.ReactNode }) => (
  <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>{title}</h3>
    <div style={{ width: '100%', height: 220 }}>
      {children}
    </div>
  </div>
);

const TimeframeSelector = ({ days, setDays }: any) => {
  const opts = [{ label: '7D', val: 7 }, { label: '14D', val: 14 }, { label: '30D', val: 30 }, { label: 'All', val: null }];
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
      {opts.map(o => (
        <button key={o.label} onClick={() => setDays(o.val)} style={{ background: days === o.val ? 'var(--accent-color)' : 'var(--panel-bg)', color: days === o.val ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '16px', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
};

const CategorySelector = ({ categories, selectedCategory, setSelectedCategory }: any) => (
  <select value={selectedCategory || ''} onChange={(e) => setSelectedCategory(e.target.value || null)} className="apple-input" style={{ marginBottom: '1.5rem', width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>
    <option value="">All Categories (Overview)</option>
    {categories.map((c: string) => (
      <option key={c} value={c}>{c}</option>
    ))}
  </select>
);

const OverviewPieChart = ({ data }: any) => (
  <ChartCard title="Category Breakdown">
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
          {data.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
        </Pie>
        <Tooltip contentStyle={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
      </PieChart>
    </ResponsiveContainer>
  </ChartCard>
);

const OverviewBarChart = ({ data }: any) => (
  <ChartCard title="Top Routines">
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis dataKey="title" type="category" stroke="var(--text-primary)" fontSize={11} tickLine={false} axisLine={false} width={100} />
        <Tooltip contentStyle={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} cursor={{ fill: 'var(--panel-bg)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
          {data.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </ChartCard>
);

const OverviewLineChart = ({ data }: any) => (
  <ChartCard title="Overall Activity Trend">
    <ResponsiveContainer>
      <LineChart data={data}>
        <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={10} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
        <Line type="monotone" dataKey="count" stroke="var(--accent-color)" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </ChartCard>
);

const OverviewCharts = ({ filteredLogs, crons, dict }: any) => {
  const trendData = useMemo(() => getTrendData(filteredLogs), [filteredLogs]);
  const catData = useMemo(() => getCategoryDistributionData(filteredLogs, crons), [filteredLogs, crons]);
  const routineData = useMemo(() => getRoutineDistributionData(filteredLogs, crons), [filteredLogs, crons]);
  if (filteredLogs.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>{dict?.noLogs || 'No logs for this period.'}</p>;
  const topCat = catData.length > 0 ? catData[0]?.name : '-';
  return (
    <>
      <KPICards title1="Total Logs" val1={filteredLogs.length} title2="Top Category" val2={topCat} />
      <OverviewPieChart data={catData} />
      <OverviewBarChart data={routineData} />
      <OverviewLineChart data={trendData} />
    </>
  );
};

const SpecificCategoryCharts = ({ logs, dict }: any) => {
  const trendData = useMemo(() => getTrendData(logs), [logs]);
  const routineData = useMemo(() => getCategoryRoutineDistributionData(logs), [logs]);
  if (logs.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>{dict?.noLogs || 'No logs for this category.'}</p>;
  
  const topRoutine = routineData.length > 0 ? routineData[0]?.title : '-';
  
  return (
    <>
      <KPICards title1="Category Logs" val1={logs.length} title2="Top Routine" val2={topRoutine} />
      <OverviewBarChart data={routineData} />
      <OverviewLineChart data={trendData} />
    </>
  );
};

export const ReportsDashboard = ({ logs, crons, dict, selectedCategory, setSelectedCategory, days, setDays }: any) => {
  const filteredLogs = useMemo(() => filterLogsByDays(logs, days), [logs, days]);
  
  const allCategories = useMemo(() => {
    const cats = new Set(crons.map((c: Cron) => c.category || 'Custom'));
    return Array.from(cats);
  }, [crons]);

  const specificLogs = useMemo(() => selectedCategory ? filteredLogs.filter(l => {
    const cron = crons.find((c: Cron) => c.cron_id === l.cron_id);
    return (cron?.category || 'Custom') === selectedCategory;
  }) : [], [filteredLogs, crons, selectedCategory]);

  return (
    <div>
      <TimeframeSelector days={days} setDays={setDays} />
      <CategorySelector categories={allCategories} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />
      {selectedCategory ? <SpecificCategoryCharts logs={specificLogs} dict={dict} /> : <OverviewCharts filteredLogs={filteredLogs} crons={crons} dict={dict} />}
    </div>
  );
};
