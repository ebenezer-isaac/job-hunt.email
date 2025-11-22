export type LogLevel = "info" | "warning" | "error" | "success";

export type Organization = {
  id?: string;
  name?: string;
  domain?: string;
  estimated_num_employees?: number;
};

export type ApolloCandidate = {
  id?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  emailStatus?: string;
  seniority?: string;
  linkedin_url?: string;
  linkedinUrl?: string;
  organization?: Organization;
};

export type SearchResponse = {
  people?: ApolloCandidate[];
  contacts?: ApolloCandidate[];
};

export type MixedCompanyResponse = {
  organizations?: Organization[];
};

export type EnrichResponse = {
  person?: ApolloCandidate | null;
};

export type FindContactParams = {
  personName: string;
  companyName: string;
  companyDomain: string;
  logCallback?: (message: string, level?: LogLevel) => void;
};
