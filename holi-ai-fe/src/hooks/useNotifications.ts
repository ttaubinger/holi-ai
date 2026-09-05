import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';

export interface Cron {
  cron_id: string;
  title: string;
  schedule: string;
  cron_expression?: string;
  description?: string;
  is_active: boolean;
  requires_logging?: boolean;
  category?: string;
  log_type?: string;
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

const buildNativeNotification = (c: Cron): LocalNotificationSchema | null => {
  if (!c.is_active || !c.cron_expression) return null;
  const scheduleOn = parseCronToSchedule(c.cron_expression);
  if (!scheduleOn) return null;
  return {
    id: generateId(c),
    title: c.title,
    body: c.description || 'Holistic Coach Routine',
    schedule: { on: scheduleOn },
    group: c.cron_id,
    extra: { route: 'routine_detail', cron_id: c.cron_id } 
  };
};

const buildNativeNotifications = (crons: Cron[]): LocalNotificationSchema[] => {
  return crons.map(buildNativeNotification).filter(Boolean) as LocalNotificationSchema[];
};

const cancelNative = async (pendingResult: any, activeIds: Set<number>) => {
  const toCancel = pendingResult.notifications.filter((n: any) => !activeIds.has(n.id));
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: toCancel.map((n: any) => ({ id: n.id })) });
  }
};

const scheduleNative = async (notifs: LocalNotificationSchema[], pendingResult: any) => {
  const pendingIds = new Set(pendingResult.notifications.map((n: any) => n.id));
  const toSchedule = notifs.filter(n => !pendingIds.has(n.id));
  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
};

const handleNativeScheduling = async (crons: Cron[]) => {
  const notifs = buildNativeNotifications(crons);
  await LocalNotifications.requestPermissions();
  const pendingResult = await LocalNotifications.getPending();
  const activeIds = new Set(notifs.map(n => n.id));
  await cancelNative(pendingResult, activeIds);
  await scheduleNative(notifs, pendingResult);
};

const cancelAllNativeNotifications = async () => {
  const pendingResult = await LocalNotifications.getPending();
  if (pendingResult.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pendingResult.notifications.map((n: any) => ({ id: n.id }))
    });
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

const setupNativeListeners = (onDeepLink: any, intervalRef: any) => {
  let lastActive = performance.now();
  const appL = App.addListener('appStateChange', (s) => { if (s.isActive) lastActive = performance.now(); });
  const notifL = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const wasClosed = performance.now() < 2500 || (performance.now() - lastActive) < 2500;
    if (onDeepLink) onDeepLink(a.notification.extra?.route || 'routines', a.notification.extra, wasClosed);
  });
  return () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    appL.then(l => l.remove());
    notifL.then(l => l.remove());
  };
};

const useSyncNativeNotifications = (crons: Cron[]) => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!crons?.length) {
      cancelAllNativeNotifications();
      return;
    }
    handleNativeScheduling(crons);
  }, [crons]);
};

const useNativeScheduling = (crons: Cron[], intervalRef: any, onDeepLink?: (route: string, extra?: any, appWasClosed?: boolean) => void) => {
  const onDeepLinkRef = useRef(onDeepLink);
  useEffect(() => { onDeepLinkRef.current = onDeepLink; }, [onDeepLink]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    return setupNativeListeners((r: string, e: any, w: boolean) => onDeepLinkRef.current?.(r, e, w), intervalRef);
  }, [intervalRef]);

  useSyncNativeNotifications(crons);
};

const useWebScheduling = (crons: Cron[], intervalRef: any, deleteCron: (id: string) => void, lastFiredRef: any) => {
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !crons?.length) return;
    handleWebScheduling(crons, intervalRef, deleteCron, lastFiredRef);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [crons, deleteCron]);
};

export const useNotifications = (crons: Cron[], deleteCron: (id: string) => void, onDeepLink?: (route: string, extra?: any, appWasClosed?: boolean) => void) => {
  const intervalRef = useRef<any>(null);
  const lastFiredRef = useRef<Record<string, string>>({});
  
  useNativeScheduling(crons, intervalRef, onDeepLink);
  useWebScheduling(crons, intervalRef, deleteCron, lastFiredRef);
};
