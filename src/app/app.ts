import { ChangeDetectorRef, Component, inject, NgZone, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Ss } from '@core/services/singleton.service';
import { fun } from '@core/services/functions.service';
import { LoadingComponent } from '@core/components/loading-component/loading-component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected title = 'ecn-form';
  isReady: boolean = false;

  cdRef = inject(ChangeDetectorRef);
  ngZone = inject(NgZone);

  ngOnInit(): void {
    this.initializeSingletonServices().then(() => {
      this.isReady = true;
    });
  }

  private initializeSingletonServices(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Ss.cdRef = this.cdRef;
      Ss.ngZone = this.ngZone;

      fun.setTimeout(() => resolve(), 500);
    });
  }
}
