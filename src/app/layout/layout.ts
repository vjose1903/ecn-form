import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, computed, effect, inject, Injector, OnInit, runInInjectionContext, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { CopyToClipboardService } from '@core/services/copy-to-clipboard.service';
import { fun } from '@core/services/functions.service';
import { Ss } from '@core/services/singleton.service';
import { ToastService } from '@core/services/toast.service';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Subject, takeUntil } from 'rxjs';
import { Menu } from './menu/menu';
import { MenuService } from './menu/menu.service';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { CityClass } from '@core/entities/city/city.class';
import { CityService } from '@core/entities/city/city.service';
import { UserService } from '@core/entities/user/user.service';
import { SkeletonModule } from 'primeng/skeleton';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { buildVersion } from '../../environments/build-version';

@Component({
  selector: 'app-layout',
  imports: [CommonModule, RouterOutlet, ButtonModule, MenuModule, Menu, SkeletonModule],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout implements OnInit {
  currentYear = new Date().getFullYear();
  appVersion = buildVersion.label;
  router = inject(Router);
  authService = inject(AuthService);
  menuService = inject(MenuService);
  private cdRef = inject(ChangeDetectorRef);
  retreatHomeService = inject(RetreatHomeService);
  private firestore = inject(Firestore);
  private retreatService = inject(RetreatService);
  private cityService = inject(CityService);

  // Signal para la ruta actual
  currentPath = signal(fun.getActualPathName());
  city = signal<CityClass | null>(null);
  accessibleCities = this.cityService.cities;
  private citiesLoadedForUid = '';
  private observedCityId = '';

  items: MenuItem[] = [
    { label: 'Link de Formulario', icon: 'pi pi-share-alt', command: () => this.copyLink() },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.logOut() },
  ];

  // Rutas donde no mostrar el botón de logout
  private readonly excludePaths = ['/auth/login', '/auth/register', '/auth/crear-contrasena', '/formulario/'];

  // Computed para determinar si mostrar el botón de logout
  isAdminRoute = computed(() => {
    const path = this.currentPath();
    return fun.hasValue(path) && !this.excludePaths.some(excludePath => path.startsWith(excludePath));
  });

  isAuthRoute = computed(() => {
    const path = this.currentPath();
    return fun.hasValue(path) && path.includes('/auth/');
  });

  private onDestroy$ = new Subject<void>();

  constructor() {
    effect(() => {
      const isAuthRoute = this.isAuthRoute();
      const user = Ss.authService.current_user();
      const isSuperAdmin = Ss.authService.isSuperAdmin();
      const activeCityId = Ss.authService.activeCityId();

      if (!isAuthRoute && fun.isEmpty(this.city())) this.setCity();
      if (user && isSuperAdmin && this.citiesLoadedForUid !== user.uid) void this.loadAccessibleCities(user.uid);
      if (activeCityId && activeCityId !== this.observedCityId) {
        this.observedCityId = activeCityId;
        void this.updateCityContext(activeCityId);
      }
    });
  }

  ngOnInit(): void {
    this.setupRouterListener();

  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  private setupRouterListener(): void {
    this.router.events.pipe(takeUntil(this.onDestroy$)).subscribe(event => {
      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.currentPath.set(fun.getActualPathName());
        this.cdRef.detectChanges();
      }
    });
  }

  setCity() {
    this.city.set(Ss.authService.current_user()?.cityData ?? null);

    if (fun.isEmpty(this.city()) && this.currentPath().includes('/formulario/')) {
      const user_id = this.currentPath().split('/')[2];

      runInInjectionContext(Ss.injector, () => {
        const userService = inject(UserService);
        userService.getPublicFormUser(user_id).then(user => {
          this.city.set(user?.cityData ?? null);
        });
      });
    }
    return this.city();
  }

  private async loadAccessibleCities(uid: string): Promise<void> {
    this.citiesLoadedForUid = uid;
    try {
      const activeId = Ss.authService.activeCityId() || Ss.authService.current_user()?.city || '';
      if (Ss.authService.isSuperAdmin()) {
        await this.cityService.loadAllCities();
      } else if (activeId) {
        const city = await this.cityService.getCityById(activeId);
        this.cityService.cities.set(city ? [city] : []);
      }
      await this.selectCity(activeId);
    } catch (error) {
      console.error('No se pudieron cargar las ciudades disponibles:', JSON.stringify(error));
    }
  }

  async selectCity(cityId: string): Promise<void> {
    if (!cityId) return;
    Ss.authService.activeCityId.set(cityId);
  }

  private async updateCityContext(cityId: string): Promise<void> {
    const city = this.accessibleCities().find(item => item.id === cityId)
      ?? (Ss.authService.current_user()?.city === cityId ? Ss.authService.current_user()?.cityData : null);
    if (city) this.city.set(city);
    else {
      const snapshot = await getDoc(doc(this.firestore, `city/${cityId}`));
      if (snapshot.exists()) this.city.set(new CityClass({id: snapshot.id, ...snapshot.data()} as any));
    }
    await Promise.all([this.retreatService.refresh(), this.retreatHomeService.refresh()]);
  }

  logOut() {
    Ss.authService.logout();
  }

  copyLink() {
    const user = Ss.authService.current_user();
    if (!user) {
      Ss.toastService.error({ message: 'No se pudo obtener el usuario' });
      Ss.authService.logout();
      return;
    }

    const cityId = Ss.authService.activeCityId() || user.city;
    if (Ss.authService.isSuperAdmin() && cityId && cityId !== user.city) {
      Ss.copyToClipboardService.copyText(`${window.location.origin}/formulario/${cityId}`);
      Ss.toastService.info({message: 'Link copiado al portapapeles', title: 'Link de Formulario'});
      return;
    }
    user.copyFormLink();
  }
}
