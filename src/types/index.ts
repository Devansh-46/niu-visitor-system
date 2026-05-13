export type VisitorPurpose =
  | 'HR'
  | 'Admission Enquiry - New'
  | 'Admission Enquiry - Re Visit'
  | 'VC Office'
  | 'Academics';

export type MerittoStatus =
  | 'pending'
  | 'created'
  | 'skipped'
  | 'duplicate'
  | 'failed';

export interface Visitor {
  id: string;
  serial: number;
  timestamp: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  purpose: VisitorPurpose;
  program: string;
  meetWith: string;
  notes: string;
  photoUrl: string;
  photoPath: string;
  operator: string;
  merittoStatus?: MerittoStatus;
  merittoLeadId?: string;
  merittoError?: string;
}

export interface AppConfig {
  email: string;
  cc: string;
  sheetsURL: string;
  operator: string;
  emailjsKey: string;
  emailjsService: string;
  emailjsTemplate: string;
  autoEmail: boolean;
}

export interface MerittoLeadPayload {
  name: string;
  email: string;
  mobile: string;
  source: string;
  [key: string]: string;
}

export interface MerittoResponse {
  status: MerittoStatus;
  leadId?: string;
  message?: string;
  error?: string;
}