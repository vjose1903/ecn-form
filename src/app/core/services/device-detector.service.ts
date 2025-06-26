import { Injectable } from '@angular/core';
import { BrowserE, deviceDetectorI, DeviceE, OSE } from '../models/device-detector.model';

@Injectable({
  providedIn: 'root',
})
export class DeviceDetectorService {
  private userAgent: string = navigator.userAgent;

  constructor() {}

  getDeviceInfo(): deviceDetectorI {
    const browser = this.detectBrowser();
    const browser_parsed = this.detectBrowser().replaceAll(' ', '-').toLowerCase();
    const device = this.detectDevice();
    const os = this.detectOS();

    return { browser, browser_parsed, device, os };
  }

  private detectBrowser(): string {
    if (this.userAgent.indexOf('Firefox') > -1) {
      return BrowserE.mozillaFirefox;
    } else if (this.userAgent.indexOf('SamsungBrowser') > -1) {
      return BrowserE.samsungInternet;
    } else if (this.userAgent.indexOf('Opera') > -1 || this.userAgent.indexOf('OPR') > -1) {
      return BrowserE.opera;
    } else if (this.userAgent.indexOf('Trident') > -1) {
      return BrowserE.microsoftInternetExplorer;
    } else if (this.userAgent.indexOf('Edge') > -1) {
      return BrowserE.microsoftEdge;
    } else if (this.userAgent.indexOf('Chrome') > -1) {
      return BrowserE.googleChrome;
    } else if (this.userAgent.indexOf('Safari') > -1) {
      return BrowserE.safari;
    } else {
      return BrowserE.unknown;
    }
  }

  private detectDevice(): string {
    if (this.userAgent.match(/mobile/i)) {
      return DeviceE.mobile;
    } else if (this.userAgent.match(/tablet/i)) {
      return DeviceE.tablet;
    } else {
      return DeviceE.desktop;
    }
  }

  private detectOS(): string {
    if (this.userAgent.indexOf('Windows') > -1) {
      return OSE.windows;
    } else if (this.userAgent.indexOf('Mac') > -1) {
      return OSE.ios;
    } else if (this.userAgent.indexOf('X11') > -1) {
      return OSE.unix;
    } else if (this.userAgent.indexOf('Linux') > -1) {
      return OSE.linux;
    } else {
      return OSE.unknown;
    }
  }
}
