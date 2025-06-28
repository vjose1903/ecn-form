import { ChangeDetectorRef, Injectable, NgZone } from '@angular/core';
// import { Firestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class Ss {
  //   public static firestore: Firestore;

  public static cdRef: ChangeDetectorRef;
  public static ngZone: NgZone;

  constructor() {}
}
