export type VisitorPurpose =
  | 'HR'
  | 'Admission Enquiry - New'
  | 'Admission Enquiry - Re Visit'
  | 'VC Office'
  | 'Academics';

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
  merittoStatus?: 'pending' | 'created' | 'updated' | 'skipped' | 'failed';
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
  status: 'created' | 'updated' | 'skipped' | 'failed';
  leadId?: string;
  message?: string;
  error?: string;
}
