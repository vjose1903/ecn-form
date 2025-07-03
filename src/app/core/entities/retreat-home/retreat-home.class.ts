import { FileClass } from '../file/file.class';
import { RetreatHomeI } from './retreat-home.model';
import { City } from '../city/city.class';

export class RetreatHome {
  id: string = '';
  name: string = '';
  phone: string = '';
  address: string = '';
  location: string = '';
  city: string = '';
  cityData?: City;
  is_active: boolean = true;
  images: Array< FileClass | string> = [];

  constructor(retreatHome: RetreatHomeI & { city?: any }) {
    this.id = retreatHome.id || '';
    this.name = retreatHome.name;
    this.phone = retreatHome.phone;
    this.address = retreatHome.address;
    this.location = retreatHome.location;
    
    // Manejar city que puede ser string (ID) o objeto (referencia resuelta)
    if (typeof retreatHome.city === 'string') {
      this.city = retreatHome.city;
    } else if (retreatHome.city && typeof retreatHome.city === 'object' && retreatHome.city.id) {
      // Si city es un objeto (referencia resuelta), extraer el ID y crear cityData
      this.city = retreatHome.city.id;
      this.cityData = new City(retreatHome.city);
    } else {
      this.city = '';
    }
    
    this.is_active = retreatHome.is_active || true;
    this.images = retreatHome.images || [];
  }

  asJson() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      address: this.address,
      location: this.location,
      city: this.city,
      cityData: this.cityData?.asJson(),
      is_active: this.is_active,
      images: this.images,
    };
  }
} 