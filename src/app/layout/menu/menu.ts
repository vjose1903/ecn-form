import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
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
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

type MenuPermissionRequirement = {resource: string; actions: string[]; any?: boolean};

const MENU_PERMISSION_REQUIREMENTS: Record<string, MenuPermissionRequirement[]> = {
  '/dashboard': [
    {resource: 'retreats', actions: ['read', 'list']},
    {resource: 'requests', actions: ['read', 'list']},
    {resource: 'dashboard', actions: [], any: true},
  ],
  '/retiros': [{resource: 'retreats', actions: ['read', 'list']}],
  '/solicitudes-archivadas': [{resource: 'requests', actions: ['read', 'list']}],
  '/casas-de-retiro': [{resource: 'retreat_homes', actions: ['read', 'list']}],
  '/roles-y-permisos': [{resource: 'roles', actions: ['read', 'list']}],
  '/auditoria': [{resource: 'audit', actions: ['read', 'list']}],
  '/usuarios': [{resource: 'members', actions: ['read', 'list']}],
};

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
  private firestore = inject(Firestore);
  availableCities = input<CityClass[]>([]);
  activeCityId = input('');
  citySelected = output<string>();
  citySearch = signal('');
  filteredCities = computed(() => {
    const query = this.citySearch().trim().toLocaleLowerCase();
    return this.availableCities().filter(city => !query || `${city.label} ${city.large_label}`.toLocaleLowerCase().includes(query));
  });
  private menuPermissions = signal<Record<string, any>>({});
  private permissionsLoadId = 0;
  items: MenuItem[] = [
    { label: 'Dashboard', icon: 'pi pi-chart-bar', link: '/dashboard', severity: 'contrast' },
    { label: 'Retiros', icon: 'pi pi-calendar-plus', link: '/retiros', severity: 'contrast' },
    { label: 'Solicitudes archivadas', icon: 'pi pi-inbox', link: '/solicitudes-archivadas', severity: 'contrast' },
    { label: 'Casas de Retiro', icon: 'pi pi-home', link: '/casas-de-retiro', severity: 'contrast' },
    { label: 'Ciudades', icon: 'pi pi-map', link: '/ciudades', severity: 'contrast' },
    { label: 'Roles y permisos', icon: 'pi pi-shield', link: '/roles-y-permisos', severity: 'contrast' },
    { label: 'Auditoría', icon: 'pi pi-history', link: '/auditoria', severity: 'contrast' },
    { label: 'Usuarios', icon: 'pi pi-users', link: '/usuarios', severity: 'contrast' },
    { label: 'Cuenta', icon: 'pi pi-user', command: () => this.openAccountModal(), severity: 'contrast', liClass: 'mt-auto' },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.authService.logout(), severity: 'danger' },
  ];

  visibleItems = computed(() => this.items.filter(item => {
    if (!item.link || this.authService.isSuperAdmin()) return true;
    const requirements = MENU_PERMISSION_REQUIREMENTS[item.link];
    if (!requirements) return false;
    const permissions = this.menuPermissions();
    return requirements.every(({resource, actions}) =>
      actions.length ? actions.every(action => permissions[resource]?.[action] === true) : Object.values(permissions[resource] ?? {}).some(value => value === true)
    );
  }));

  ngOnInit() {
    this.checkScreenSize();
    window.addEventListener('resize', this.checkScreenSize.bind(this));
  }

  constructor() {
    effect(() => {
      const user = this.authService.current_user();
      const cityId = this.activeCityId() || this.authService.activeCityId() || user?.city || '';
      const uid = user?.uid || user?.id || '';
      const isSuperAdmin = this.authService.isSuperAdmin();
      if (!uid || !cityId || isSuperAdmin) {
        this.permissionsLoadId++;
        this.menuPermissions.set({});
        return;
      }
      void this.loadMenuPermissions(uid, cityId);
    });
  }

  private async loadMenuPermissions(uid: string, cityId: string): Promise<void> {
    const loadId = ++this.permissionsLoadId;
    this.menuPermissions.set({});
    try {
      const member = await getDoc(doc(this.firestore, `city/${cityId}/members/${uid}`));
      const roleId = member.exists() && member.get('status') === 'active' ? member.get('role_id') : '';
      if (typeof roleId !== 'string' || !roleId) return;
      const role = await getDoc(doc(this.firestore, `city/${cityId}/roles/${roleId}`));
      if (loadId !== this.permissionsLoadId) return;
      this.menuPermissions.set(role.exists() && role.get('is_active') === true ? role.get('permissions') ?? {} : {});
    } catch (error) {
      if (loadId === this.permissionsLoadId) this.menuPermissions.set({});
      console.error('No se pudieron cargar los permisos del menú:', JSON.stringify(error));
    }
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
