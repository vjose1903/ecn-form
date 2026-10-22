export enum RetreatModality {
  PRESENCIAL = "presencial",
  VIRTUAL = "virtual",
  MIXTO = "mixto",
}

export enum RetreatModalityType {
  PRESENCIAL = "presencial",
  VIRTUAL = "virtual",
}

import {DocumentReference} from "firebase-admin/firestore";

export interface RetreatI {
  id?: string;
  number: number;
  community_name?: string;
  start_date: string | Date;
  end_date: string | Date;
  max_request_date: string | Date;
  retreat_home: DocumentReference;
  modality?: RetreatModality;
  is_active?: boolean;
  accept_requests?: boolean;
  request_count?: number;
  mixedModalityData?: {
    [date: string]: RetreatModalityType;
  };
}
