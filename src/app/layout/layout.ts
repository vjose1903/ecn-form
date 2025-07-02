import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
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

@Component({
  selector: 'app-layout',
  imports: [CommonModule, RouterOutlet, ButtonModule, MenuModule, Menu],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout implements OnInit {
  currentYear = new Date().getFullYear();
  router = inject(Router);
  menuService = inject(MenuService);
  private cdRef = inject(ChangeDetectorRef);

  // Signal para la ruta actual
  currentPath = signal(fun.getActualPathName());

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

  private onDestroy$ = new Subject<void>();

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
