import { FileI } from './file.model';
import { FileService } from './file.service';

export class FileClass {
  id: string = '';
  name: string = '';
  size: number = 0;
  url: string = '';
  file?: File;
  loaded?: boolean = false;

  constructor(fileObj: FileI, private fileService?: FileService) {
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

  getFileReference() {
    if (!this.fileService) {
      throw new Error('FileService not provided. Use FileClass.create() method instead.');
    }
    return this.fileService.getDocumentRef({ id: this.id });
  }

  // Método estático para crear instancias con inyección de dependencias
  static create(fileObj: FileI, fileService: FileService): FileClass {
    return new FileClass(fileObj, fileService);
  }
}
