export interface LinkRecord {
  id: string;
  slug: string;
  customDomainId: string | null;
  destinationUrl: string;
  title: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  clickCount: number;
  shortUrl: string;
  stats?: {
    totalClicks: number;
    uniqueClicks: number;
    clicksToday: number;
    clicks7d: number;
    clicks30d: number;
  } | null;
}

export interface LinkListResponse {
  links: LinkRecord[];
  total: number;
  page: number;
  pages: number;
}
