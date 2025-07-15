import { CityI } from "../city/city.model";

export interface UserI {
  id: string;
  uid: string;
  email: string;
  city: string | CityI;
  phone: string;
}
