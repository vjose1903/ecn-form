import { RetreatHomeI } from './retreat-home.model';

export class RetreatHome {
  id: string = '';
  name: string = '';
  phone: string = '';
  address: string = '';
  location: string = '';
  is_active: boolean = true;

  constructor(retreat: RetreatHomeI) {
    this.id = retreat.id || '';
    this.name = retreat.name;
    this.phone = retreat.phone;
    this.address = retreat.address;
    this.location = retreat.location;

    this.is_active = retreat.is_active || true;
  }

  asJson() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      address: this.address,
      location: this.location,
      is_active: this.is_active,
    };
  }
} 