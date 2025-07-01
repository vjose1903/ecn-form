import { FileI } from './file.model';

export class File {
  id: string = '';
  name: string = '';
  size: number = 0;
  fileData: globalThis.File | null = null;
  url: string = '';

  constructor(file: FileI) {
    this.id = file.id || '';
    this.name = file.name;
    this.size = file.size;
    this.fileData = file.fileData || null;
    this.url = file.url;
  }

  asJson() {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      file: this.fileData,
      url: this.url,
    };
  }
}
