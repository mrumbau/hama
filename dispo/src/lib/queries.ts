'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface EmployeeRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  shortCode: string;
  phone: string | null;
  profession: string | null;
  weeklyHours: number | null;
  driversLicense: boolean;
  note: string | null;
  active: boolean;
  isDemo: boolean;
  tradeIds: string[];
  tradeNames: string[];
}

export interface SiteManagerRow {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  shortCode: string;
  phone: string | null;
  email: string | null;
  color: string;
  note: string | null;
  active: boolean;
  isDemo: boolean;
  projectCount: number;
}

export interface SubcontractorRow {
  id: string;
  companyName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  note: string | null;
  active: boolean;
  preferred: boolean;
  rating: number | null;
  crewSize: number | null;
  isDemo: boolean;
  tradeIds: string[];
  tradeNames: string[];
}

export interface TradeRow {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export const useEmployees = () =>
  useQuery({ queryKey: ['employees'], queryFn: () => api.get<EmployeeRow[]>('/api/employees') });

export const useSiteManagers = () =>
  useQuery({
    queryKey: ['site-managers'],
    queryFn: () => api.get<SiteManagerRow[]>('/api/site-managers'),
  });

export const useSubcontractors = () =>
  useQuery({
    queryKey: ['subcontractors'],
    queryFn: () => api.get<SubcontractorRow[]>('/api/subcontractors'),
  });

export const useTrades = () =>
  useQuery({
    queryKey: ['trades'],
    queryFn: () => api.get<TradeRow[]>('/api/trades'),
    staleTime: 5 * 60_000,
  });

/** Nach jeder Mutation neu laden – Plantafel, KPIs und Warnungen hängen zusammen. */
export const BOARD_KEYS = [
  ['board'],
  ['warnings'],
  ['projects'],
  ['project'],
  ['audit'],
  ['communications'],
] as const;
