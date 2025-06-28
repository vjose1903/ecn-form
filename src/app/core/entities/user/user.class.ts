import { UserI } from './user.model';

export class User {
  email: string = '';
  uid: string = '';
  city: string = '';
  id: string = '';

  constructor(user: UserI) {
    this.email = user.email;
    this.uid = user.uid;
    this.city = user.city;
    this.id = user.id;
  }

  asJson() {
    return {
      email: this.email,
      uid: this.uid,
      city: this.city,
      id: this.id,
    };
  }
}
