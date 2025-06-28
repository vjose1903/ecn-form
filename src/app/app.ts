import { ChangeDetectorRef, Component, inject, NgZone, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Ss } from '@core/services/singleton.service';
import { fun } from '@core/services/functions.service';
import { LoadingComponent } from '@core/components/loading-component/loading-component';
import { ToastModule } from 'primeng/toast';
import { AuthService } from '@core/services/auth.service';
import { Firestore } from '@angular/fire/firestore';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingComponent, ToastModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected title = 'ECN Platform';
  isReady: boolean = false;

  cdRef = inject(ChangeDetectorRef);
  ngZone = inject(NgZone);
  authService = inject(AuthService);
  firestore = inject(Firestore);

  ngOnInit(): void {
    console.log('🚀 [App] Iniciando aplicación...');
    this.initializeSingletonServices().then(() => {
      console.log('✅ [App] Servicios singleton inicializados');

      // Manejar el redirect de Google Auth antes de marcar la app como lista

      this.isReady = true;
      console.log('✅ [App] Aplicación lista (isReady = true)');
    });
  }

  private initializeSingletonServices(): Promise<void> {
    console.log('⚙️ [App] Inicializando servicios singleton...');
    return new Promise<void>((resolve, reject) => {
      Ss.cdRef = this.cdRef;
      Ss.ngZone = this.ngZone;
      Ss.firestore = this.firestore;
      console.log('⏳ [App] Esperando 500ms para completar inicialización...');

      fun.setTimeout(() => {
        console.log('✅ [App] Delay completado, resolviendo promesa');
        resolve();
      }, 500);
    });
  }
}
