import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class MenuService {
  visible = signal(false);

  toggleMenu(visible?: boolean) {
    this.visible.set(visible ?? !this.visible());
  }
}
