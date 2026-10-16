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
import { CityClass } from '@core/entities/city/city.class';
import { UserService } from '@core/entities/user/user.service';
import { SkeletonModule } from 'primeng/skeleton';
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
  menuService = inject(MenuService);
  private cdRef = inject(ChangeDetectorRef);
  retreatHomeService = inject(RetreatHomeService);

  // Signal para la ruta actual
  currentPath = signal(fun.getActualPathName());
  city = signal<CityClass | null>(null);

  items: MenuItem[] = [
    { label: 'Link de Formulario', icon: 'pi pi-share-alt', command: () => this.copyLink() },
    { label: 'Cerrar sesión', icon: 'pi pi-sign-out', command: () => this.logOut() },
  ];

  // Rutas donde no mostrar el botón de logout
  private readonly excludePaths = ['/auth/login', '/auth/register', '/formulario/'];

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
    // Solo ejecutar una vez al inicializar
    const isAuthenticated = Ss.authService.isAuthenticated();

    if (isAuthenticated) {
      this.retreatHomeService.refresh();
    }

    effect(() => {
      const isAuthRoute = this.isAuthRoute();

      if (!isAuthRoute && fun.isEmpty(this.city())) this.setCity();
    });
  }

  ngOnInit(): void {
    this.setupRouterListener();

    // Verificar autenticación después de la inicialización
    const isAuthenticated = Ss.authService.isAuthenticated();
    if (isAuthenticated) {
      this.retreatHomeService.refresh();
    }
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
        userService.getUserById(user_id).then(user => {
          this.city.set(user?.cityData ?? null);
        });
      });
    }
    return this.city();
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

    user.copyFormLink();
  }
}
