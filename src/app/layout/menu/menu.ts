import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';
import { PopoverModule } from 'primeng/popover';
import { MenuService } from './menu.service';
import { MenuItem } from './menu.model';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { RouterModule } from '@angular/router';
import { Ss } from '@core/services/singleton.service';
import { Account } from '@pages/account/account';
import { CityClass } from '@core/entities/city/city.class';

@Component({
  selector: 'app-menu',
  imports: [CommonModule, DrawerModule, PopoverModule, RouterModule],
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
})
export class Menu implements OnInit, OnDestroy {
  public menuService = inject(MenuService);
  public router = inject(Router);
  public authService = inject(AuthService);
  availableCities = input<CityClass[]>([]);
  activeCityId = input('');
  citySelected = output<string>();
  citySearch = signal('');
  filteredCities = computed(() => {
    const query = this.citySearch().trim().toLocaleLowerCase();
    return this.availableCities().filter(city => !query || `${city.label} ${city.large_label}`.toLocaleLowerCase().includes(query));
  });

  items: MenuItem[] = [
    { label: 'Dashboard', icon: 'pi pi-chart-bar', link: '/dashboard', severity: 'contrast' },
    { label: 'Retiros', icon: 'pi pi-calendar-plus', link: '/retiros', severity: 'contrast' },
    { label: 'Solicitudes archivadas', icon: 'pi pi-inbox', link: '/solicitudes-archivadas', severity: 'contrast' },
    { label: 'Casas de Retiro', icon: 'pi pi-home', link: '/casas-de-retiro', severity: 'contrast' },
    { label: 'Roles y permisos', icon: 'pi pi-shield', link: '/roles-y-permisos', severity: 'contrast' },
    { label: 'Usuarios', icon: 'pi pi-users', link: '/usuarios', severity: 'contrast' },
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

  selectCity(city: CityClass) {
    this.citySelected.emit(city.id);
    this.citySearch.set('');
  }
}
