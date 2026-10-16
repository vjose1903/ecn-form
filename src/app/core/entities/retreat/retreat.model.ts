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
  user_id?: string;
  number: number;
  community_name?: string;
  start_date: string;
  end_date: string;
  max_request_date: string;
  retreat_home: string;
  modality?: RetreatModality;
  is_active?: boolean;
  accept_requests?: boolean;
  request_count?: number;
  amount_per_person?: number | null;
  mixedModalityData?: {
    [date: string]: RetreatModalityType;
  };
}
