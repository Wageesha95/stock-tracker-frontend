export interface AuthUser {
  id: string;
  username: string;
  role: 'USER' | 'ADMIN';
  readMode?: boolean;
  dividendPayoutsEnabled?: boolean;
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
  // TRANSFER_OUT / TRANSFER_IN are the two legs of a broker-to-broker transfer:
  // same count, same price, zero commission, so they net to no change in shares,
  // cost basis or average price. A TRANSFER_OUT never realizes a gain.
  type: 'BUY' | 'SELL' | 'RIGHTS' | 'SCRIP_DIVIDEND' | 'IPO' | 'TRANSFER_OUT' | 'TRANSFER_IN';
  count: number;
  price: number;
  commission: number;
  brokerId?: string | null;
  // For shares that arrived by transfer, the date their money was originally
  // committed. Opportunity cost accrues from here, not from the transfer date.
  costBasisDate?: string | null;
  disabled?: boolean;
  converted?: boolean;
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
  brokerId?: string | null;
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
  note?: string;
}

export interface MarketData {
  id: string;
  companyCode: string;
  companyName: string;
  open: number;
  lastTrade: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume?: number;
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
