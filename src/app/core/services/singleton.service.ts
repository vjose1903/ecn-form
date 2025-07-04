import { ChangeDetectorRef, Injectable, Injector, NgZone } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { ToastService } from './toast.service';
import { CopyToClipboardService } from './copy-to-clipboard.service';
import { AuthService } from './auth.service';
import { ConfirmationService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { FileService } from '@core/entities/file/file.service';

@Injectable({
  providedIn: 'root',
})
export class Ss {
  public static firestore: Firestore;

  public static ngZone: NgZone;
  public static toastService: ToastService;
  public static copyToClipboardService: CopyToClipboardService;
  public static authService: AuthService;
  public static confirmationService: ConfirmationService;
  public static injector: Injector;
  public static dialogService: DialogService;
  public static fileService: FileService;

  constructor() {}
}
