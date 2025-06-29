import { ChangeDetectorRef, Injectable, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { ToastService } from './toast.service';
import { CopyToClipboardService } from './copy-to-clipboard.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class Ss {
  public static firestore: Firestore;

  public static cdRef: ChangeDetectorRef;
  public static ngZone: NgZone;
  public static toastService: ToastService;
  public static copyToClipboardService: CopyToClipboardService;
  public static authService: AuthService;

  constructor() {}
}
