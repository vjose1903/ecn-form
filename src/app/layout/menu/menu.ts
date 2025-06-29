import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';
import { MenuService } from './menu.service';
import { MenuItem } from './menu.model';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-menu',
  imports: [CommonModule, DrawerModule, RouterModule],
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
})
export class Menu implements OnInit, OnDestroy {
  public menuService = inject(MenuService);
  public router = inject(Router);
  private authService = inject(AuthService);

  items: MenuItem[] = [
    { label: 'Retiros', icon: 'pi pi-calendar-plus', link: '/retiros', severity: 'contrast' },
    { label: 'Casas de Retiro', icon: 'pi pi-home', link: '/casas-de-retiro', severity: 'contrast' },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', severity: 'danger', command: () => this.authService.logout(), liClass: 'mt-auto' },
  ];

  ngOnInit() {
    this.checkScreenSize();
    window.addEventListener('resize', this.checkScreenSize.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.checkScreenSize.bind(this));
  }

  private checkScreenSize() {
    if (window.innerWidth >= 1024) {
      this.menuService.toggleMenu(false);
    }
  }

  executeCommand(item: MenuItem) {
    if (item.command) item.command();
  }
}
