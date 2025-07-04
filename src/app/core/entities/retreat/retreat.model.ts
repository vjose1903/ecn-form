export enum RetreatModality {
  PRESENCIAL = 'presencial',
  VIRTUAL = 'virtual',
  MIXTO = 'mixto'
}

export enum RetreatModalityType {
  PRESENCIAL = 'presencial',
  VIRTUAL = 'virtual'
}

export interface RetreatI {
  id?: string;
  number: number;
  start_date: string;
  end_date: string;
  max_request_date: string;
  retreat_home: string;
  modality?: RetreatModality;
  mixedModalityData?: {
    [date: string]: RetreatModalityType;
  };
  is_active?: boolean;
  accept_requests?: boolean;
}