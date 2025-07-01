export interface FileI {
  id?: string;
  name: string;
  size: number;
  fileData: globalThis.File | null;
  url: string;
}