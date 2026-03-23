import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';
import { MenuService } from './menu.service';
import { MenuItem } from './menu.model';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { RouterModule } from '@angular/router';
import { Ss } from '@core/services/singleton.service';
import { Account } from '@pages/account/account';

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
    { label: 'Cuenta', icon: 'pi pi-user', command: () => this.openAccountModal(), severity: 'contrast', liClass: 'mt-auto' },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.authService.logout(), severity: 'danger' },
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

    if (this.menuService.visible()) {
      this.menuService.toggleMenu(false);
    }
  }

  openAccountModal() {
    const dialogService = Ss.dialogService;

    if (!dialogService) {
      console.error('DialogService no disponible');
      return;
    }

    const dialogRef = dialogService.open(Account, {
      header: 'Editar Cuenta',
      width: '500px',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });

    dialogRef?.onClose.subscribe();
  }
}
