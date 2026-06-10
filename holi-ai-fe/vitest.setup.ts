import '@testing-library/jest-dom';
import { vi } from 'vitest';

const mockStorage: Record<string, string> = {};

const getItem = (key: string) => mockStorage[key] || null;
const setItem = (key: string, value: string) => { mockStorage[key] = value; };
const removeItem = (key: string) => { delete mockStorage[key]; };
const clear = () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); };

Object.defineProperty(window, 'localStorage', { value: { getItem, setItem, removeItem, clear } });

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockCapacitor = { schedule: vi.fn(), getPending: vi.fn().mockResolvedValue({ notifications: [] }), cancel: vi.fn(), checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }), requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }) };

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mockCapacitor }));

export const getMockFetch = () => mockFetch;
