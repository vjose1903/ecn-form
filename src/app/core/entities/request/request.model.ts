export interface RequestI {
  id: string;
  how_find_us: string;
  retreat: string;
  retreatData: any;
  have_wedding_date: boolean;
  who_invited_you: string;
  wedding_date: Date | string | null;
  dating_period: string;
  how_find_us_other: string;
  she: CoupleI;
  he: CoupleI;
  is_active?: boolean;
  is_accepted: boolean | null;
}

export interface CoupleI {
  full_name: string;
  age: number;
  city_of_residence: string;
  are_you_married: boolean;
  live_accompanied: boolean;
  religion: string;
  emergency_full_name: string;
  have_children: boolean;
  identity_type: string;
  birth_date: BirthDate | Date | string;
  church_name: string;
  home_phone: string;
  companion_phone: string;
  email: string;
  nickname: string;
  address: string;
  emergency_relationship: string;
  cell_phone: string;
  identity_number: string;
  work_phone: string;
  companion_relationship: string;
  companion_full_name: string;
  emergency_phone: string;
}
export interface BirthDate {
  seconds: number;
  nanoseconds: number;
}
