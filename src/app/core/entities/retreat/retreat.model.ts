export interface RetreatI {
  id?: string;
  number: number;
  start_date: string;
  end_date: string;
  max_request_date: string;
  location: string;
  price: number;

  is_active?: boolean;
  accept_requests?: boolean;
}