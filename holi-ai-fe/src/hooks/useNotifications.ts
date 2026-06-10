import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';


export interface Cron {
  cron_id: string;
  title: string;
  schedule: string;
  cron_expression?: string;
  description?: string;
  is_active: boolean;
}

const parseCronToSchedule = (cronExpr: string) => {
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) return null;
  const m = parseInt(parts[0]!);
  const h = parseInt(parts[1]!);
  if (isNaN(m) || isNaN(h)) return null;
  return { hour: h, minute: m };
};

const generateId = (c: Cron) => {
  const str = c.cron_id + (c.cron_expression || '') + c.title;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || Math.floor(Math.random() * 100000);
};

const buildNativeNotifications = (crons: Cron[]): LocalNotificationSchema[] => {
  const notifs: LocalNotificationSchema[] = [];
  for (const c of crons) {
    if (!c.is_active || !c.cron_expression) continue;
    const scheduleOn = parseCronToSchedule(c.cron_expression);
    if (!scheduleOn) continue;
    notifs.push({
      id: generateId(c),
      title: c.title,
      body: c.description || 'Holistic Coach Routine',
      schedule: { on: scheduleOn }
    });
  }
  return notifs;
};

const handleNativeScheduling = async (crons: Cron[]) => {
  const notifs = buildNativeNotifications(crons);
  await LocalNotifications.requestPermissions();
  
  const pendingResult = await LocalNotifications.getPending();
  const pendingIds = new Set(pendingResult.notifications.map(n => n.id));
  
  const toSchedule = notifs.filter(n => !pendingIds.has(n.id));
  const activeIds = new Set(notifs.map(n => n.id));
  const toCancel = pendingResult.notifications.filter(n => !activeIds.has(n.id));
  
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: toCancel.map(n => ({ id: n.id })) });
  }
  
  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
};

const isCronOneOff = (c: Cron) => {
  const p = c.cron_expression!.split(' ');
  const d = p[2] !== '*', mo = p[3] !== '*';
  const lower = c.schedule.toLowerCase();
  return (d && mo) || lower.includes('today') || lower.includes('once');
};

const triggerWebCron = (c: Cron, deleteCron: (id: string) => void) => {
  new Notification(c.title, { body: c.description || 'Holistic Coach Routine' });
  if (isCronOneOff(c)) deleteCron(c.cron_id);
};

const isCronMatch = (c: Cron, now: Date) => {
  const p = c.cron_expression!.split(' ');
  if (p.length !== 5) return false;
  const m = parseInt(p[0]!), h = parseInt(p[1]!);
  const time = now.getHours() === h && now.getMinutes() === m;
  const d = p[2] === '*' || now.getDate() === parseInt(p[2]!);
  const mo = p[3] === '*' || now.getMonth() === parseInt(p[3]!) - 1;
  const dow = p[4] === '*' || now.getDay() === parseInt(p[4]!);
  return time && d && mo && dow;
};

const checkWebCrons = (crons: Cron[], deleteCron: (id: string) => void, lastFired: Record<string, string>) => {
  const now = new Date();
  for (const c of crons) {
    if (!c.is_active || !c.cron_expression || !isCronMatch(c, now)) continue;
    const signature = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (lastFired[c.cron_id] === signature) continue;
    lastFired[c.cron_id] = signature;
    triggerWebCron(c, deleteCron);
  }
};

const handleWebScheduling = (crons: Cron[], intervalRef: any, deleteCron: (id: string) => void, lastFiredRef: any) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    Notification.requestPermission();
    if (intervalRef.current) clearInterval(intervalRef.current);
    checkWebCrons(crons, deleteCron, lastFiredRef.current);
    intervalRef.current = setInterval(() => checkWebCrons(crons, deleteCron, lastFiredRef.current), 10000);
  }
};

export const useNotifications = (crons: Cron[], deleteCron: (id: string) => void) => {
  const intervalRef = useRef<any>(null);
  const lastFiredRef = useRef<Record<string, string>>({});
  
  useEffect(() => {
    if (!crons?.length) return;
    if (Capacitor.isNativePlatform()) {
      handleNativeScheduling(crons);
    } else {
      handleWebScheduling(crons, intervalRef, deleteCron, lastFiredRef);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [crons]);
};
