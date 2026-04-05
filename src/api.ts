import axios from 'axios';
import { AuthUser, Company, StockPrice, Transaction, Dividend, PortfolioItem, RealizedGainItem, MarketData, IndustryGroup } from './types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api',
});

// Add JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 interceptor — clear token (AuthContext handles redirect)
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && !error.config.url?.includes('/auth/')) {
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (username: string, password: string) =>
  api.post<AuthUser & { token: string; readMode: boolean }>('/auth/login', { username, password }).then(res => {
    localStorage.setItem('token', res.data.token);
    return res.data;
  });
export const logout = () => {
  localStorage.removeItem('token');
  return api.post('/auth/logout').then(res => res.data);
};
export const getMe = () =>
  api.get<AuthUser>('/auth/me').then(res => res.data);

// --- Client-side cache ---
interface CacheEntry<T> { data: T; ts: number; }
const cache: Record<string, CacheEntry<any>> = {};
const CACHE_TTL = 60_000; // 1 minute

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return Promise.resolve(entry.data);
  }
  return fetcher().then(data => {
    cache[key] = { data, ts: Date.now() };
    return data;
  });
}

export function invalidate(...prefixes: string[]) {
  for (const k of Object.keys(cache)) {
    if (prefixes.some(p => k.startsWith(p))) {
      delete cache[k];
    }
  }
}

export function clearAllCache() {
  for (const k of Object.keys(cache)) {
    delete cache[k];
  }
}

// Companies
export const getCompanies = () => cached('companies', () => api.get<Company[]>('/companies').then(res => res.data));
export const createCompany = (data: { code: string; name: string }) =>
  api.post<Company>('/companies', data).then(res => { invalidate('companies', 'portfolio', 'market'); return res.data; });
export const updateCompany = (id: string, data: { code: string; name: string; industryGroupId?: string }) =>
  api.put<Company>(`/companies/${id}`, data).then(res => { invalidate('companies'); return res.data; });
export const deleteCompany = (id: string) =>
  api.delete(`/companies/${id}`).then(res => { invalidate('companies', 'portfolio'); return res; });
export const uploadCompanyLogo = (code: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<Company>(`/companies/${code}/logo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(res => { invalidate('companies'); return res.data; });
};

// Industry Groups
export const getIndustryGroups = () => cached('industry-groups', () => api.get<IndustryGroup[]>('/industry-groups').then(res => res.data));
export const createIndustryGroup = (name: string) =>
  api.post<IndustryGroup>('/industry-groups', { name }).then(res => { invalidate('industry-groups'); return res.data; });
export const updateIndustryGroup = (id: string, name: string) =>
  api.put<IndustryGroup>(`/industry-groups/${id}`, { name }).then(res => { invalidate('industry-groups'); return res.data; });
export const deleteIndustryGroup = (id: string) =>
  api.delete(`/industry-groups/${id}`).then(res => { invalidate('industry-groups', 'companies'); return res; });

// Stock Prices
export const getStockPrices = (companyCode: string) =>
  cached(`stockprices:${companyCode}`, () => api.get<StockPrice[]>(`/stock-prices/company/${companyCode}`).then(res => res.data));
export const createStockPrice = (data: { companyCode: string; price: number; date: string }) =>
  api.post<StockPrice>('/stock-prices', data).then(res => { invalidate('stockprices'); return res.data; });

// Transactions
export const getTransactions = () => cached('transactions', () => api.get<Transaction[]>('/transactions').then(res => res.data));
export const getTransactionsByCompany = (code: string) =>
  cached(`transactions:${code}`, () => api.get<Transaction[]>(`/transactions/company/${code}`).then(res => res.data));
export const createTransaction = (data: Omit<Transaction, 'id' | 'createdAt'>) =>
  api.post<Transaction>('/transactions', data).then(res => { invalidate('transactions', 'portfolio', 'realized', 'summary'); return res.data; });
export const deleteTransaction = (id: string) =>
  api.delete(`/transactions/${id}`).then(res => { invalidate('transactions', 'portfolio', 'realized', 'summary'); return res; });

// PDF Upload
export const previewPdf = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<{
    transactions: { companyCode: string; companyName: string; date: string; type: 'BUY' | 'SELL'; count: number; price: number; commission: number }[];
    suggestedDate: string | null;
  }>(
    '/pdf/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } }
  ).then(res => res.data);
};
export const uploadPdf = (file: File, tradeDate: string, brokerId: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tradeDate', tradeDate);
  formData.append('brokerId', brokerId);
  return api.post<Transaction[]>('/pdf/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(res => { invalidate('transactions', 'portfolio', 'realized', 'summary', 'companies', 'uploads'); return res.data; });
};
export const getPdfUploads = () =>
  cached('uploads', () => api.get<{ id: string; filename: string; tradeDate: string; brokerId: string; transactionCount: number; uploadedAt: string }[]>('/pdf/uploads').then(res => res.data));
export const deletePdfUpload = (id: string) =>
  api.delete(`/pdf/uploads/${id}`).then(res => { invalidate('uploads', 'transactions', 'portfolio', 'realized', 'summary'); return res; });

// Brokers
export interface BrokerData {
  id: string;
  name: string;
  createdAt: string;
}
export const getBrokers = () => cached('brokers', () => api.get<BrokerData[]>('/brokers').then(res => res.data));
export const createBroker = (name: string) =>
  api.post<BrokerData>('/brokers', { name }).then(res => { invalidate('brokers'); return res.data; });
export const deleteBroker = (id: string) =>
  api.delete(`/brokers/${id}`).then(res => { invalidate('brokers'); return res; });

// Dividends
export const getDividends = () => cached('dividends', () => api.get<Dividend[]>('/dividends').then(res => res.data));
export const getDividendsByCompany = (code: string) =>
  cached(`dividends:${code}`, () => api.get<Dividend[]>(`/dividends/company/${code}`).then(res => res.data));
export const createDividend = (data: Omit<Dividend, 'id' | 'createdAt'>) =>
  api.post<Dividend>('/dividends', data).then(res => { invalidate('dividends'); return res.data; });
export const updateDividend = (id: string, data: Omit<Dividend, 'id' | 'createdAt'>) =>
  api.put<Dividend>(`/dividends/${id}`, data).then(res => { invalidate('dividends'); return res.data; });
export const deleteDividend = (id: string) =>
  api.delete(`/dividends/${id}`).then(res => { invalidate('dividends'); return res; });

// Trade Summary / Market Data
export const previewTradeSummary = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post<{ companyCode: string; companyName: string; lastTrade: number; change: number; changePercent: number }[]>(
    '/market-data/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } }
  ).then(res => res.data);
};
export const uploadTradeSummary = (file: File, tradeDate: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('tradeDate', tradeDate);
  return api.post('/market-data/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(res => { invalidate('market', 'portfolio', 'summary'); return res.data; });
};
export const getPortfolio = () => cached('portfolio', () => api.get<PortfolioItem[]>('/dashboard/portfolio').then(res => res.data));
export const getRealizedGains = () => cached('realized', () => api.get<RealizedGainItem[]>('/dashboard/realized').then(res => res.data));
export const getMarketData = () => cached('market', () => api.get<MarketData[]>('/market-data').then(res => res.data));
export const getMarketDataHistory = (code: string) =>
  cached(`market-history:${code}`, () => api.get<MarketData[]>(`/market-data/${code}/history`).then(res => res.data));
export const getDashboardSummary = () => cached('summary', () => api.get<{
  bankInterestRate: number;
  opportunityCost: number;
  breakdown: { companyCode: string; companyName: string; date: string; amount: number; days: number; interest: number }[];
}>('/dashboard/summary').then(res => res.data));
// Admin
export const getAdminStats = () => cached('admin-stats', () => api.get<{
  totalUsers: number;
  users: { id: string; username: string; role: string; transactionCount: number; createdAt: string }[];
}>('/admin/stats').then(res => res.data));
export const createAdminUser = (data: { username: string; password: string; role: string }) =>
  api.post('/admin/users', data).then(res => { invalidate('admin-stats'); return res.data; });
export const updateAdminUser = (id: string, data: { username?: string; password?: string; role?: string }) =>
  api.put(`/admin/users/${id}`, data).then(res => { invalidate('admin-stats'); return res.data; });
export const deleteAdminUser = (id: string) =>
  api.delete(`/admin/users/${id}`).then(res => { invalidate('admin-stats'); return res; });
export const unlockUser = (id: string) =>
  api.put(`/admin/users/${id}/unlock`).then(res => { invalidate('admin-stats'); return res.data; });

export const getDashboardAll = () => cached('dashboard-all', () => api.get<{
  portfolio: PortfolioItem[];
  realizedItems: RealizedGainItem[];
  opportunityCost: number;
  interestBreakdown: { companyCode: string; companyName: string; date: string; amount: number; days: number; interest: number }[];
  bankInterestRate: number;
  sectors: { sector: string; companies: { companyCode: string; companyName: string; sharesHeld: number; currentValue: number; totalInvested: number; unrealizedGain: number; unrealizedGainPercent: number; unrealizedDayGain: number; changePercent: number }[]; currentValue: number; totalInvested: number; unrealizedGain: number; unrealizedDayGain: number; companyCount: number }[];
}>('/dashboard/all').then(res => res.data));

// Rights
export interface RightsData {
  id: string;
  companyCode: string;
  date: string;
  count: number;
  price: number;
  transactionId: string;
  createdAt: string;
}
export const getRights = () => cached('rights', () => api.get<RightsData[]>('/rights').then(res => res.data));
export const createRights = (data: { companyCode: string; date: string; count: number; price: number }) =>
  api.post<RightsData>('/rights', data).then(res => { invalidate('rights', 'transactions', 'portfolio', 'dashboard-all'); return res.data; });
export const updateRights = (id: string, data: { date: string; count: number; price: number }) =>
  api.put<RightsData>(`/rights/${id}`, data).then(res => { invalidate('rights', 'transactions', 'portfolio', 'dashboard-all'); return res.data; });
export const deleteRights = (id: string) =>
  api.delete(`/rights/${id}`).then(res => { invalidate('rights', 'transactions', 'portfolio', 'dashboard-all'); return res; });

// IPO
export interface IpoData {
  id: string;
  companyCode: string;
  date: string;
  count: number;
  price: number;
  transactionId: string;
  createdAt: string;
}
export const getIpos = () => cached('ipos', () => api.get<IpoData[]>('/ipos').then(res => res.data));
export const createIpo = (data: { companyCode: string; date: string; count: number; price: number }) =>
  api.post<IpoData>('/ipos', data).then(res => { invalidate('ipos', 'transactions', 'portfolio', 'dashboard-all'); return res.data; });
export const updateIpo = (id: string, data: { date: string; count: number; price: number }) =>
  api.put<IpoData>(`/ipos/${id}`, data).then(res => { invalidate('ipos', 'transactions', 'portfolio', 'dashboard-all'); return res.data; });
export const deleteIpo = (id: string) =>
  api.delete(`/ipos/${id}`).then(res => { invalidate('ipos', 'transactions', 'portfolio', 'dashboard-all'); return res; });

// Share Splits
export interface ShareSplitData {
  id: string;
  companyCode: string;
  date: string;
  fromShares: number;
  toShares: number;
  type: string;
  createdAt: string;
}
export const getShareSplits = () => cached('share-splits', () => api.get<ShareSplitData[]>('/share-splits').then(res => res.data));
export const createShareSplit = (data: { companyCode: string; date: string; fromShares: number; toShares: number }) =>
  api.post<ShareSplitData>('/share-splits', data).then(res => { invalidate('share-splits', 'dashboard-all', 'portfolio'); return res.data; });
export const updateShareSplit = (id: string, data: { date: string; fromShares: number; toShares: number }) =>
  api.put<ShareSplitData>(`/share-splits/${id}`, data).then(res => { invalidate('share-splits', 'dashboard-all', 'portfolio'); return res.data; });
export const deleteShareSplit = (id: string) =>
  api.delete(`/share-splits/${id}`).then(res => { invalidate('share-splits', 'dashboard-all', 'portfolio'); return res; });

// Watchlists
export interface WatchlistData {
  id: string;
  name: string;
  color: string;
  companyCodes: string[];
  createdAt: string;
  updatedAt: string;
}
export const getWatchlists = () => api.get<WatchlistData[]>('/watchlists').then(res => res.data);
export const createWatchlist = (name: string, color: string) => api.post<WatchlistData>('/watchlists', { name, color }).then(res => res.data);
export const updateWatchlist = (id: string, data: { name?: string; color?: string; companyCodes?: string[] }) =>
  api.put<WatchlistData>(`/watchlists/${id}`, data).then(res => res.data);
export const deleteWatchlist = (id: string) => api.delete(`/watchlists/${id}`);
export const addWatchlistCompany = (id: string, companyCode: string) =>
  api.post<WatchlistData>(`/watchlists/${id}/companies`, { companyCode }).then(res => res.data);
export const removeWatchlistCompany = (id: string, code: string) =>
  api.delete<WatchlistData>(`/watchlists/${id}/companies/${code}`).then(res => res.data);
