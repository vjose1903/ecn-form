import {DocumentReference} from "firebase-admin/firestore";

export interface UserI {
  id: string;
  uid: string;
  email: string;
  phone: string;
  city: string | CityI | DocumentReference;
}

export interface CityI {
  id: string;
  key: string;
  label: string;
  definite_article: string;
  large_label: string;
}
