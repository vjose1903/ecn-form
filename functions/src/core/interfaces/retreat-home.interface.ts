import {CityI} from "./user.interface";

export interface RetreatHomeI {
  id?: string;
  name: string;
  phone: string;
  address: string;
  location: string;
  city: string | CityI;
  images: Array<any>;
  is_active?: boolean;
}
