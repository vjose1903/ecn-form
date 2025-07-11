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
  status: RequestStatus;
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
}

export interface RequestStatusInfo {
  amount: number;
  tooltip: string;
  severity: 'secondary' | 'success' | 'danger';
  label: string;
  labelPlural: string;
}

export interface RequestStats {
  [prop: string]: RequestStatusInfo;
}
