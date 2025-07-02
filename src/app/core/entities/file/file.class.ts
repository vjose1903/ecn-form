import { FileI } from './file.model';

export class FileClass {
  id: string = '';
  name: string = '';
  size: number = 0;
  url: string = '';
  file?: File;

  constructor(fileObj: FileI) {
    this.id = fileObj.id || '';
    this.name = fileObj.name || (fileObj.file?.name || '');
    this.size = fileObj.size || (fileObj.file?.size || 0);
    this.url = fileObj.url || '';
    this.file = fileObj.file;
  }

  asJson() {
    return {
      id: this.id,
      name: this.name,
      size: this.size,
      url: this.url,
    };
  }

  get fileStoragePath() {
    return `retreat_homes/${this.name}`;
  }
}
