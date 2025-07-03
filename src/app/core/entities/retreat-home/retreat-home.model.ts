import { FileClass } from '../file/file.class';

export interface RetreatHomeI {
  id?: string;
  name: string;
  phone: string;
  address: string;
  location: string;
  city: string;
  images: Array<FileClass | string>;
  is_active?: boolean;
}
