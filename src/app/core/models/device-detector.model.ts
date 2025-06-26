export interface deviceDetectorI {
  browser: string;
  browser_parsed: string;
  device: string;
  os: string;
}

export enum BrowserE {
  mozillaFirefox = 'Mozilla Firefox',
  samsungInternet = 'Samsung Internet',
  opera = 'Opera',
  microsoftInternetExplorer = 'Microsoft Internet Explorer',
  microsoftEdge = 'Microsoft Edge',
  googleChrome = 'Google Chrome',
  safari = 'Safari',
  unknown = 'Unknown',
}
export enum BrowserParsedE {
  mozillaFirefox = 'mozilla-firefox',
  samsungInternet = 'samsung-internet',
  opera = 'opera',
  microsoftInternetExplorer = 'microsoft-internet-explorer',
  microsoftEdge = 'microsoft-edge',
  googleChrome = 'google-chrome',
  safari = 'safari',
  unknown = 'unknown',
}

export enum DeviceE {
  mobile = 'Mobile',
  tablet = 'Tablet',
  desktop = 'Desktop',
}

export enum OSE {
  windows = 'Windows',
  ios = 'IOS',
  unix = 'UNIX',
  linux = 'Linux',
  unknown = 'Unknown',
}
