import { CityI } from '../city/city.model';
import { FileClass } from '../file/file.class';
import { FileI } from '../file/file.model';

export interface RetreatHomeI {
  id?: string;
  name: string;
  phone: string;
  address: string;
  location: string;
  city: string | CityI;
  images: Array<FileClass | string | FileI>;
  is_active?: boolean;
}
