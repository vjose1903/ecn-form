import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { fun } from '@core/services/functions.service';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, ButtonModule],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout implements OnInit {
  currentYear = new Date().getFullYear();
  authService = inject(AuthService);
  router = inject(Router);

  // Signal para la ruta actual
  currentPath = signal(fun.getActualPathName());

  // Rutas donde no mostrar el botón de logout
  private readonly excludePaths = ['/auth/login', '/auth/register', '/formulario/'];

  // Computed para determinar si mostrar el botón de logout
  showLogout = computed(() => {
    const path = this.currentPath();
    return fun.hasValue(path) && !this.excludePaths.some(excludePath => path.startsWith(excludePath));
  });

  private onDestroy$ = new Subject<void>();

  logOut() {
    this.authService.logout();
  }

  ngOnInit(): void {
    this.setupRouterListener();
  }

  private setupRouterListener(): void {
    this.router.events.pipe(takeUntil(this.onDestroy$)).subscribe(event => {
      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.currentPath.set(fun.getActualPathName());
        Ss.cdRef.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }
}
