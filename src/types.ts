export interface AuthUser {
  id: string;
  username: string;
  role: 'USER' | 'ADMIN';
}

export interface Company {
  id: string;
  code: string;
  name: string;
  logoUrl?: string;
  industryGroupId?: string;
  createdAt: string;
}

export interface IndustryGroup {
  id: string;
  name: string;
}

export interface StockPrice {
  id: string;
  companyCode: string;
  price: number;
  date: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  companyCode: string;
  date: string;
  type: 'BUY' | 'SELL' | 'RIGHTS' | 'SCRIP_DIVIDEND';
  count: number;
  price: number;
  commission: number;
  createdAt: string;
}

export interface Dividend {
  id: string;
  companyCode: string;
  type: 'CASH' | 'SCRIP';
  amount: number;
  date: string;
  xdDate?: string;
  shares: number;
  scripShares: number;
  totalAmount: number;
  taxed?: boolean;
  createdAt: string;
}

export interface RealizedGainItem {
  companyCode: string;
  companyName: string;
  logoUrl?: string;
  sellDate: string;
  sharesSold: number;
  avgBuyPrice: number;
  sellPrice: number;
  commission: number;
  realizedGain: number;
  gainPercent: number;
}

export interface MarketData {
  id: string;
  companyCode: string;
  companyName: string;
  lastTrade: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  tradeDate: string;
  updatedAt: string;
}

export interface PortfolioItem {
  companyCode: string;
  companyName: string;
  logoUrl?: string;
  sharesHeld: number;
  avgBuyPrice: number;
  lastTrade: number;
  currentValue: number;
  totalInvested: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  unrealizedDayGain: number;
  realizedGain: number;
  change: number;
  changePercent: number;
}
