export type UserPlan = "FREE" | "PRO" | "TEAM";
export type UserRole = "OWNER" | "EDITOR" | "VIEWER";

export interface Team {
  id: string;
  name: string;
  slug: string;
  plan: UserPlan;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  plan: UserPlan;
  role: UserRole;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Link {
  id: string;
  userId: string;
  slug: string;
  destinationUrl: string;
  title: string | null;
  active: boolean;
  expiresAt: string | null;
  scheduledAt: string | null;
  maxClicks: number | null;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClickLog {
  id: string;
  linkId: string;
  clickedAt: string;
  ipHash: string;
  country: string | null;
  city: string | null;
  region: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  isBot: boolean;
  language: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}
