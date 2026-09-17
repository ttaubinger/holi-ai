export const ReportsDashboard = ({ logs, crons, dict, selectedCategory, setSelectedCategory, days, setDays }: any) => {
  const filteredLogs = useMemo(() => filterLogsByDays(logs, days), [logs, days]);
  const allCategories = useMemo(() => Array.from(new Set(crons.map((c: Cron) => c.category || 'Custom'))), [crons]);
  const specificLogs = useMemo(() => selectedCategory ? filteredLogs.filter(l => (crons.find((c: Cron) => c.cron_id === l.cron_id)?.category || 'Custom') === selectedCategory) : [], [filteredLogs, crons, selectedCategory]);
  return (
    <div>
      <TimeframeSelector days={days} setDays={setDays} />
      <CategorySelector categories={allCategories} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />
      {selectedCategory ? <SpecificCategoryCharts logs={specificLogs} dict={dict} /> : <OverviewCharts filteredLogs={filteredLogs} crons={crons} dict={dict} />}
    </div>
  );
};
