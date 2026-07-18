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
export const signup = (username: string, password: string) =>
  api.post<AuthUser & { token: string; readMode: boolean }>('/auth/signup', { username, password }).then(res => {
    localStorage.setItem('token', res.data.token);
    return res.data;
  });
export const logout = () => {
  return api.post('/auth/logout').finally(() => {
    localStorage.removeItem('token');
  });
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
// Enable/disable all of the current user's transactions under a company code
// (e.g. retire a ".R" rights holding once converted to shares).
export const setTransactionsDisabledByCompany = (code: string, value: boolean, converted = false) =>
  api.put(`/transactions/company/${code}/disabled?value=${value}&converted=${converted}`).then(res => {
    invalidate('transactions', 'portfolio', 'realized', 'summary', 'dashboard-all');
    return res.data;
  });

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
export const updatePdfUpload = (id: string, tradeDate: string, brokerId: string) =>
  api.put(`/pdf/uploads/${id}`, { tradeDate, brokerId }).then(res => { invalidate('uploads', 'transactions', 'portfolio', 'realized', 'summary', 'dashboard-all'); return res.data; });

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

// User Settings
export interface UserSettingsData {
  id?: string;
  userId?: string;
  selectedBrokerIds: string[];
  selectedDataBrokerIds?: string[];
  tableColumns: Record<string, string[]>;
  companyTtmWeeks?: Record<string, number>;
}
export const getUserSettings = () => cached('settings', () => api.get<UserSettingsData>('/settings').then(res => res.data));
export const updateSelectedBrokers = (selectedBrokerIds: string[]) =>
  api.put<UserSettingsData>('/settings/brokers', { selectedBrokerIds }).then(res => { invalidate('settings'); return res.data; });
export const updateSelectedDataBrokers = (selectedDataBrokerIds: string[]) =>
  api.put<UserSettingsData>('/settings/data-brokers', { selectedDataBrokerIds }).then(res => { invalidate('settings', 'dashboard-all'); return res.data; });
export const updateTableColumns = (tableColumns: Record<string, string[]>) =>
  api.put<UserSettingsData>('/settings/table-columns', tableColumns).then(res => { invalidate('settings'); return res.data; });
export const updateCompanyTtmWeeks = (companyCode: string, weeks: number | null) =>
  api.put<UserSettingsData>(`/settings/company-ttm-weeks/${companyCode}`, { weeks }).then(res => { invalidate('settings'); return res.data; });

// Messages (user → admin, with admin replies)
export interface MessageReply {
  fromUsername: string;
  content: string;
  createdAt: string;
}
export interface Message {
  id: string;
  fromUsername: string;
  content: string;
  read: boolean;
  userRead: boolean;
  replies: MessageReply[] | null;
  createdAt: string;
  readAt: string | null;
}
export const sendMessage = (content: string) =>
  api.post<Message>('/messages', { content }).then(res => { invalidate('my-messages'); return res.data; });
export const getMyMessages = () =>
  cached('my-messages', () => api.get<Message[]>('/messages/mine').then(res => res.data));
export const getUnreadReplyCount = () =>
  api.get<{ count: number }>('/messages/unread-reply-count').then(res => res.data.count);
export const markRepliesRead = () =>
  api.put('/messages/read-replies').then(res => { invalidate('my-messages'); return res; });
export const getAdminMessages = () =>
  api.get<Message[]>('/admin/messages').then(res => res.data);
export const getUnreadMessageCount = () =>
  api.get<{ count: number }>('/admin/messages/unread-count').then(res => res.data.count);
export const markMessageRead = (id: string) =>
  api.put<Message>(`/admin/messages/${id}/read`).then(res => res.data);
export const replyToMessage = (id: string, content: string) =>
  api.post<Message>(`/admin/messages/${id}/reply`, { content }).then(res => res.data);
export const deleteMessage = (id: string) =>
  api.delete(`/admin/messages/${id}`);

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
export interface SparklineData { prices: number[]; dates: string[]; }
export const getSparklines = (days?: number) => {
  const d = days || Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000);
  return cached(`sparklines:${d}`, () => api.get<Record<string, SparklineData>>(`/market-data/sparklines?days=${d}`).then(res => res.data));
};
export interface YtdEntry { ytd: number; firstPrice: number; firstDate: string; lastPrice: number; }
export const getYtdData = () => cached('ytd', () => api.get<Record<string, YtdEntry>>('/market-data/ytd').then(res => res.data));
export interface YearLowEntry { price: number; date: string; }
export const getYearLow = () => cached('year-low', () => api.get<Record<string, YearLowEntry>>('/market-data/year-low').then(res => res.data));
export const getMarketDataHistory = (code: string) =>
  cached(`market-history:${code}`, () => api.get<MarketData[]>(`/market-data/${code}/history`).then(res => res.data));
export const getAvailableDates = () => cached('market-dates', () => api.get<string[]>('/market-data/dates').then(res => res.data));
export const getMarketDataByDate = (date: string) =>
  cached(`market-by-date:${date}`, () => api.get<MarketData[]>(`/market-data/by-date/${date}`).then(res => res.data));
export interface MarketDataDateSummary { date: string; count: number; }
export const getMarketDataDateSummary = () =>
  cached('market-date-summary', () => api.get<MarketDataDateSummary[]>('/market-data/date-summary').then(res => res.data));
// Notes
export interface Note {
  id: string;
  userId: string;
  companyCode: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}
export const getNotes = () => cached('notes', () => api.get<Note[]>('/notes').then(res => res.data));
export const getNotesByCompany = (code: string) =>
  cached(`notes:${code}`, () => api.get<Note[]>(`/notes/company/${code}`).then(res => res.data));
export const createNote = (data: { companyCode: string; key?: string; value: string }) =>
  api.post<Note>('/notes', data).then(res => { invalidate('notes'); return res.data; });
export const updateNote = (id: string, data: { key?: string; value?: string }) =>
  api.put<Note>(`/notes/${id}`, data).then(res => { invalidate('notes'); return res.data; });
export const deleteNote = (id: string) =>
  api.delete(`/notes/${id}`).then(res => { invalidate('notes'); return res; });

export interface InterestLot {
  buyDate: string;
  shares: number;
  remaining: number;
  costPerShare: number;
  lotCost: number;
  status: 'held' | 'sold' | 'partial';
  endDate: string | null;
  days: number;
  interest: number;
}
export interface InterestBreakdownItem {
  companyCode: string;
  companyName: string;
  date: string;
  amount: number;
  days: number;
  interest: number;
  lots?: InterestLot[];
}

export const getDashboardSummary = () => cached('summary', () => api.get<{
  bankInterestRate: number;
  opportunityCost: number;
  breakdown: InterestBreakdownItem[];
}>('/dashboard/summary').then(res => res.data));
// Admin
export const getSystemStats = () => cached('system-stats', () => api.get<{
  companies: number; transactions: number; dividends: number; dividendPayouts: number;
  marketData: number; stockPrices: number; industryGroups: number; watchlists: number;
  loginHistory: number; latestMarketDate: string | null; marketDataDates: number;
}>('/admin/system-stats').then(res => res.data));

export const getAdminStats = () => cached('admin-stats', () => api.get<{
  totalUsers: number;
  users: { id: string; username: string; role: string; transactionCount: number; locked: boolean; dividendPayoutsEnabled: boolean; createdAt: string }[];
}>('/admin/stats').then(res => res.data));
export const createAdminUser = (data: { username: string; password: string; role: string }) =>
  api.post('/admin/users', data).then(res => { invalidate('admin-stats'); return res.data; });
export const updateAdminUser = (id: string, data: { username?: string; password?: string; role?: string }) =>
  api.put(`/admin/users/${id}`, data).then(res => { invalidate('admin-stats'); return res.data; });
export const deleteAdminUser = (id: string) =>
  api.delete(`/admin/users/${id}`).then(res => { invalidate('admin-stats'); return res; });
export const unlockUser = (id: string) =>
  api.put(`/admin/users/${id}/unlock`).then(res => { invalidate('admin-stats'); return res.data; });
export const toggleDividendPayouts = (id: string) =>
  api.put(`/admin/users/${id}/dividend-payouts`).then(res => { invalidate('admin-stats'); return res.data; });

// Admin: per-user ".R" rights records with enable/disable
export interface RightsRecord {
  userId: string;
  companyCode: string;
  shares: number;
  disabled: boolean;
  txCount: number;
}
export const getRightsRecords = () =>
  cached('rights-records', () => api.get<RightsRecord[]>('/admin/rights-records').then(res => res.data));
export const setRightsRecordDisabled = (userId: string, code: string, value: boolean) =>
  api.put(`/admin/rights-records/disabled?userId=${encodeURIComponent(userId)}&code=${encodeURIComponent(code)}&value=${value}`)
    .then(res => { invalidate('rights-records', 'dashboard-all', 'transactions', 'portfolio'); return res.data; });

export interface LoginHistoryItem {
  id: string;
  username: string;
  action: string;
  device: string;
  ipAddress: string;
  location: string;
  readMode: boolean;
  timestamp: string;
}
export const getLoginHistory = () => api.get<LoginHistoryItem[]>('/admin/login-history').then(res => res.data);

// Dividend Payout Scraper
export interface DividendPayoutData {
  id?: string;
  companyCode: string;
  exDividendDate: string;
  amountPerShare: number | null;
  type: string | null;
  paymentDate: string | null;
  announcementDate: string | null;
  dividendType: string | null;
  priceOnXdDate: number | null;
  priceOnAnnouncementDate: number | null;
  declarationDate: string | null;
  recordDate: string | null;
  yield: number | null;
  scrapedAt: string | null;
}
export const scrapeDividendPreview = (companyCode: string) =>
  api.post<DividendPayoutData[]>(`/admin/scrape/dividends/${companyCode}/preview`).then(res => res.data);
export const scrapeDividendConfirm = (companyCode: string, payouts: DividendPayoutData[]) =>
  api.post<{ companyCode: string; newRecords: number; totalScraped: number }>(`/admin/scrape/dividends/${companyCode}/confirm`, payouts).then(res => res.data);
export const getAllDividendPayouts = () =>
  cached('dividend-payouts', () => api.get<DividendPayoutData[]>('/dividend-payouts').then(res => res.data));
export const getDividendPayouts = (companyCode: string) =>
  api.get<DividendPayoutData[]>(`/dividend-payouts/company/${companyCode}`).then(res => res.data);

export interface DividendPayoutInput {
  companyCode: string;
  exDividendDate: string;
  amountPerShare: number | null;
  paymentDate: string | null;
  announcementDate: string | null;
  dividendType: string | null;
  priceOnXdDate?: number | null;
  priceOnAnnouncementDate?: number | null;
}
export const createDividendPayout = (data: DividendPayoutInput) =>
  api.post<DividendPayoutData>('/admin/dividend-payouts', data).then(res => { invalidate('dividend-payouts', 'upcoming-dividends'); return res.data; });
export const updateDividendPayout = (id: string, data: DividendPayoutInput) =>
  api.put<DividendPayoutData>(`/admin/dividend-payouts/${id}`, data).then(res => { invalidate('dividend-payouts', 'upcoming-dividends'); return res.data; });
export const deleteDividendPayout = (id: string) =>
  api.delete(`/admin/dividend-payouts/${id}`).then(res => { invalidate('dividend-payouts', 'upcoming-dividends'); return res.data; });

export interface UpcomingDividendItem {
  companyCode: string;
  yearsAppeared: number;
  avgAmountPerShare: number;
  history: { year: number; exDividendDate: string; amountPerShare: number | null; paymentDate: string | null; announcementDate: string | null; dividendType: string | null; priceOnXdDate: number | null }[];
}
export const getUpcomingDividends = (months: number) =>
  cached(`upcoming-dividends:${months}`, () => api.get<UpcomingDividendItem[]>(`/dividend-payouts/upcoming?months=${months}`).then(res => res.data));
export const scrapeDividendDebug = (companyCode: string) =>
  api.post<string>(`/admin/scrape/dividends/${companyCode}/debug`).then(res => res.data);

// Dividend Financials (FY: DPS, yield, payout ratio)
export interface DividendFinancialData {
  id?: string;
  companyCode: string;
  year: number;
  dividendPerShare: number | null;
  earningsPerShare: number | null;
  dividendYield: number | null;
  scrapedAt: string | null;
}
export const scrapeDividendFinancialsPreview = (companyCode: string) =>
  api.post<{ year: number; dps: number | null; eps: number | null; yield: number | null }[]>(`/admin/scrape/dividend-financials/${companyCode}/preview`).then(res => res.data);
export const scrapeDividendFinancialsConfirm = (companyCode: string) =>
  api.post<{ companyCode: string; totalScraped: number; saved: number }>(`/admin/scrape/dividend-financials/${companyCode}/confirm`).then(res => res.data);
export const getDividendFinancials = (companyCode: string) =>
  api.get<DividendFinancialData[]>(`/dividend-financials/company/${companyCode}`).then(res => res.data);
export const scrapeDividendFinancialsAll = () =>
  api.post<{ totalCompanies: number; succeeded: number; failed: number; details: { companyCode: string; scraped?: number; saved?: number; error?: string }[] }>('/admin/scrape/dividend-financials').then(res => res.data);

// Dividend Calendar Scraper (stockdecision.com)
export const scrapeDividendCalendarPreview = (dateStart: string, dateEnd: string) =>
  api.post<Record<string, any>[]>(`/admin/scrape/dividend-calendar/preview?dateStart=${dateStart}&dateEnd=${dateEnd}`).then(res => res.data);
export const scrapeDividendCalendarConfirm = (records: Record<string, any>[]) =>
  api.post<{ totalScraped: number; created: number; updated: number; skipped: number }>('/admin/scrape/dividend-calendar/confirm', records).then(res => res.data);

// Market Data Scraper
export interface ScrapedBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export const scrapeMarketDataPreview = (companyCode: string) =>
  api.post<ScrapedBar[]>(`/market-data/scrape/${companyCode}/preview`).then(res => res.data);
export const scrapeMarketDataConfirm = (companyCode: string) =>
  api.post<{ companyCode: string; totalScraped: number; newRecords: number }>(`/market-data/scrape/${companyCode}/confirm`).then(res => res.data);
export const scrapeMarketDataSaveBar = (companyCode: string, bar: ScrapedBar) =>
  api.post<{ date: string; status: string }>(`/market-data/scrape/${companyCode}/save-bar`, bar).then(res => res.data);
export const scrapeMarketDataSaveBars = (companyCode: string, bars: ScrapedBar[]) =>
  api.post<{ companyCode: string; totalBars: number; newRecords: number }>(`/market-data/scrape/${companyCode}/save-bars`, bars).then(res => res.data);
export const scrapeMarketDataAll = () =>
  api.post<{ totalCompanies: number; succeeded: number; failed: number; details: { companyCode: string; totalScraped?: number; newRecords?: number; error?: string }[] }>('/market-data/scrape-all').then(res => res.data);

// Market Data Delete
export const deleteMarketDataRange = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return api.delete<{ deletedCount: number; range: string }>(`/market-data/range?${params}`).then(res => { invalidate('market'); return res.data; });
};

// Optional broker data filter: pass the selected broker ids (may include "__none__"
// for manual/no-broker trades). Empty/omitted returns the unfiltered dashboard.
// Filtered results are cached under a broker-specific key so unfiltered callers
// (e.g. CompanyView) keep the plain 'dashboard-all' entry.
export const getDashboardAll = (brokers?: string[]) => {
  const active = brokers && brokers.length > 0;
  const query = active ? `?brokers=${brokers.map(encodeURIComponent).join(',')}` : '';
  const key = active ? `dashboard-all:${[...brokers].sort().join(',')}` : 'dashboard-all';
  return cached(key, () => api.get<{
    portfolio: PortfolioItem[];
    realizedItems: RealizedGainItem[];
    opportunityCost: number;
    interestBreakdown: InterestBreakdownItem[];
    bankInterestRate: number;
    sectors: { sector: string; companies: { companyCode: string; companyName: string; sharesHeld: number; currentValue: number; totalInvested: number; unrealizedGain: number; unrealizedGainPercent: number; unrealizedDayGain: number; changePercent: number }[]; currentValue: number; totalInvested: number; unrealizedGain: number; unrealizedDayGain: number; companyCount: number }[];
  }>(`/dashboard/all${query}`).then(res => res.data));
};

// Rights
export interface RightsData {
  id: string;
  companyCode: string;
  date: string;
  count: number;
  price: number;
  brokerId?: string | null;
  transactionId: string;
  createdAt: string;
}
export const getRights = () => cached('rights', () => api.get<RightsData[]>('/rights').then(res => res.data));
export const createRights = (data: { companyCode: string; date: string; count: number; price: number; brokerId?: string | null }) =>
  api.post<RightsData>('/rights', data).then(res => { invalidate('rights', 'transactions', 'portfolio', 'dashboard-all'); return res.data; });
export const updateRights = (id: string, data: { date: string; count: number; price: number; brokerId?: string | null }) =>
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
  brokerId?: string | null;
  transactionId: string;
  createdAt: string;
}
export const getIpos = () => cached('ipos', () => api.get<IpoData[]>('/ipos').then(res => res.data));
export const createIpo = (data: { companyCode: string; date: string; count: number; price: number; brokerId?: string | null }) =>
  api.post<IpoData>('/ipos', data).then(res => { invalidate('ipos', 'transactions', 'portfolio', 'dashboard-all'); return res.data; });
export const updateIpo = (id: string, data: { date: string; count: number; price: number; brokerId?: string | null }) =>
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
export const getWatchlists = () => cached('watchlists', () => api.get<WatchlistData[]>('/watchlists').then(res => res.data));
export const createWatchlist = (name: string, color: string) => api.post<WatchlistData>('/watchlists', { name, color }).then(res => { invalidate('watchlists'); return res.data; });
export const updateWatchlist = (id: string, data: { name?: string; color?: string; companyCodes?: string[] }) =>
  api.put<WatchlistData>(`/watchlists/${id}`, data).then(res => { invalidate('watchlists'); return res.data; });
export const deleteWatchlist = (id: string) => api.delete(`/watchlists/${id}`).then(res => { invalidate('watchlists'); return res; });
export const addWatchlistCompany = (id: string, companyCode: string) =>
  api.post<WatchlistData>(`/watchlists/${id}/companies`, { companyCode }).then(res => { invalidate('watchlists'); return res.data; });
export const removeWatchlistCompany = (id: string, code: string) =>
  api.delete<WatchlistData>(`/watchlists/${id}/companies/${code}`).then(res => { invalidate('watchlists'); return res.data; });
