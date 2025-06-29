import { RetreatI } from './retreat.model';

export class Retreat {
  id: string = '';
  number: number = 0;
  start_date: string = '';
  end_date: string = '';
  max_request_date: string = '';
  location: string = '';
  price: number = 0;
  is_active: boolean = true;
  accept_requests: boolean = true;

  constructor(retreat: RetreatI) {
    this.id = retreat.id || '';
    this.number = retreat.number;
    this.start_date = retreat.start_date;
    this.max_request_date = retreat.max_request_date;
    this.end_date = retreat.end_date;
    this.location = retreat.location;
    this.price = retreat.price;

    this.is_active = retreat.is_active || true;
    this.accept_requests = retreat.accept_requests || true;
  }

  asJson() {
    return {
      id: this.id,
      number: this.number,
      start_date: this.start_date,
      end_date: this.end_date,
      max_request_date: this.max_request_date,
      location: this.location,
      price: this.price,
      is_active: this.is_active,
      accept_requests: this.accept_requests,
    };
  }
} 