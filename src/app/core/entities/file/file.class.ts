import { inject, runInInjectionContext } from '@angular/core';
import { FileI } from './file.model';
import { FileService } from './file.service';
import { Ss } from '@core/services/singleton.service';

export class FileClass {
  id: string = '';
  name: string = '';
  url: string = '';
  file?: File;
  loaded?: boolean = false;

  constructor(fileObj: FileI) {
    this.id = fileObj.id || '';
    this.name = fileObj.name || fileObj.file?.name || '';
    this.url = fileObj.url || '';
    this.file = fileObj.file;
  }

  asJson() {
    return {
      id: this.id,
      name: this.name,
      url: this.url,
    };
  }

  get fileStoragePath() {
    return `retreat_homes/${this.name}`;
  }

  getFileReference() {
    return runInInjectionContext(Ss.injector, () => {
      const fileService = inject(FileService);

      return fileService.getDocumentRef({ id: this.id });
    });
  }
}
