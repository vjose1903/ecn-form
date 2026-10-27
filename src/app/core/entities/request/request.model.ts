export interface RequestI {
  id: string;
  how_find_us: string;
  retreat: string;
  retreatData?: any;
  have_wedding_date: boolean;
  who_invited_you: string;
  who_invited_you_phone: string;
  wedding_date: Date | string | null;
  dating_period_year: number;
  dating_period_month: number;
  how_find_us_other: string;
  she: CoupleI;
  he: CoupleI;
  is_active?: boolean;
  created_at?: Date | string | null;
  is_informado?: boolean;
  isConfirmed?: boolean;
  pre_retreat_payments?: PreRetreatPaymentI[];
  status: RequestStatus;
  action: RequestAction;
  archived_retreat_id?: string;
  archived_at?: Date | string | null;
}

export interface PreRetreatPaymentI {
  id: string;
  payment_date: Date | string;
  amount: number;
  receipt_path?: string;
  receipt_url?: string;
  receipt_name: string;
}

export interface NewPreRetreatPaymentI {
  payment_date: Date;
  amount: number;
  receipt: File;
}

export enum RequestAction {
  NEW = 'new',
  UPDATED = 'updated',
  ARCHIVED = 'archived',
  DESARCHIVED = 'desarchived',
  TRANSFERRED = 'transferred',
}

export enum CoupleType {
  SHE = 'she',
  HE = 'he',
}

export interface CoupleI {
  full_name: string;
  age?: number;
  city_of_residence: string;
  are_you_married: boolean;
  religion: string;
  religion_other?: string;
  emergency_full_name: string;
  have_children: boolean;
  identity_type: string;
  birth_date: BirthDate | Date | string;
  birth_date_display?: string;
  church_name: string;
  home_phone: string;
  email: string;
  nickname: string;
  address: string;
  emergency_relationship: string;
  cell_phone: string;
  identity_number: string;
  work_phone: string;
  family_information: FamilyMemberI[];
  emergency_phone: string;
}

export interface FamilyMemberI {
  familiar_phone: string;
  familiar_relationship: string;
  familiar_full_name: string;
}

export interface BirthDate {
  seconds: number;
  nanoseconds: number;
}

export enum RequestStatus {
  ALL = 'all',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export interface RequestStatusInfo {
  amount: number;
  tooltip: string;
  severity: 'secondary' | 'success' | 'danger' | 'warn' | 'info';
  label: string;
  labelPlural: string;
}

export interface RequestStats {
  [prop: string]: RequestStatusInfo;
}

export interface RequestHistoryChangeI {
  label: string;
  previous_value: string;
  next_value: string;
}

export interface RequestHistoryI {
  id: string;
  request_id: string;
  action: RequestAction;
  happened_at: Date | string | null;
  retreat_id: string;
  source_retreat_id?: string;
  target_retreat_id?: string;
  collection_state: 'request' | 'requests-archived';
  changes?: Array<string | RequestHistoryChangeI>;
  message?: string;
  receipt_url?: string;
  receipt_path?: string;
  receipt_name?: string;
  payment_id?: string;
  deletion_pending?: boolean;
  retreat_label?: string;
  source_retreat_label?: string;
  target_retreat_label?: string;
}
