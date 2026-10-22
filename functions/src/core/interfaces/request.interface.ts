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
  ALL = "all",
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

export enum coupleFieldsE {
  she = "she",
  he = "he",
  both = "both",
}

export enum fieldsLabelE {
  how_find_us = "Como se enteraron del Retiro",
  have_wedding_date = "Tiene Fecha de Boda",
  who_invited_you = "Quien los invitó",
  who_invited_you_phone = "Teléfono de quien los invitó",
  wedding_date = "Fecha de Boda",
  dating_period_year = "Años de noviazgo",
  dating_period_month = "Meses de noviazgo",
  full_name = "Nombre completo",
  age = "Edad",
  city_of_residence = "Ciudad de residencia",
  are_you_married = "Has estado casado",
  religion = "Religión",
  emergency_full_name = "Contacto de emergencia",
  have_children = "Tienes hijos",
  identity_type = "Tipo de identificación",
  birth_date = "Fecha de nacimiento",
  church_name = "Parroquia",
  home_phone = "Teléfono de casa",
  email = "Email",
  nickname = "Apodo",
  address = "Dirección",
  emergency_relationship = "Relación con contacto de emergencia",
  cell_phone = "Teléfono celular",
  identity_number = "Número de identificación",
  work_phone = "Teléfono de trabajo",
  family_information = "Información de familiares",
  familiar_full_name = "Nombre completo del familiar",
  familiar_relationship = "Relación con el familiar",
  familiar_phone = "Teléfono del familiar",
  emergency_phone = "Teléfono de contacto de emergencia",
}
