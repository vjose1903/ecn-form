import { inject, Injectable, runInInjectionContext } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { FileI } from './file.model';
import { FileClass } from './file.class';
import { AuthService } from '@core/services/auth.service';
import { Ss } from '@core/services/singleton.service';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Injectable({
  providedIn: 'root',
})
export class FileService extends FirebaseRequest<FileI> {
  private _collectionName = 'files';
  private authService = inject(AuthService);
  private functions = inject(Functions);

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  /**
   * Sube un archivo individual y retorna el metadata guardado en Firestore
   */
  async uploadFile(filePayload: FileClass): Promise<FileClass> {
    const { file, ...fileMeta } = filePayload;

    if (!file) {
      throw new Error('Archivo no proporcionado');
    }

    try {
      return await runInInjectionContext(Ss.injector, async () => {
        const cityId = this.authService.activeCityId() || this.authService.current_user()?.city;
        if (!cityId) throw new Error('El usuario no tiene una ciudad asignada');
        const createUpload = httpsCallable<{cityId: string; name: string; contentType: string; size: number}, {fileId: string; path: string; uploadUrl: string}>(this.functions, 'createCityFileUploadUrl');
        const upload = await createUpload({cityId, name: file.name, contentType: file.type, size: file.size});
        const response = await fetch(upload.data.uploadUrl, {method: 'PUT', headers: {'Content-Type': file.type}, body: file});
        if (!response.ok) throw new Error('No se pudo cargar la imagen');
        const record = httpsCallable<{cityId: string; fileId: string; path: string; name: string}, {fileId: string; url: string; path: string}>(this.functions, 'recordCityFileUpload');
        const saved = await record({cityId, fileId: upload.data.fileId, path: upload.data.path, name: file.name});
        const metadata = {...fileMeta, id: saved.data.fileId, url: saved.data.url, city_id: cityId, storage_path: saved.data.path};
        return new FileClass(metadata);
      });
    } catch (error) {
      console.error('Error al subir archivo:', error);
      throw error;
    }
  }

  /**
   * Sube múltiples archivos y retorna información detallada sobre el resultado
   */
  async uploadFiles(filePayloads: FileClass[]): Promise<{ successful: FileClass[]; failed: { file: FileClass; error: any }[] }> {
    if (!filePayloads || filePayloads.length === 0) {
      return { successful: [], failed: [] };
    }

    const uploadPromises = filePayloads.map(async filePayload => {
      try {
        const result = await this.uploadFile(filePayload);
        return { success: true, file: result, error: null };
      } catch (error) {
        console.error(`Error al subir archivo ${filePayload.name}:`, error);
        return { success: false, file: filePayload, error };
      }
    });

    try {
      const results = await Promise.all(uploadPromises);

      const successful = results.filter(result => result.success).map(result => result.file as FileClass);

      const failed = results.filter(result => !result.success).map(result => ({ file: result.file as FileClass, error: result.error }));

      return { successful, failed };
    } catch (error) {
      console.error('Error al subir múltiples archivos:', error);
      throw error;
    }
  }

  async deleteFiles(files: FileClass[]) {
    const deletePromises = files.map(async file => {
      const cityId = file.city_id || this.authService.activeCityId() || this.authService.current_user()?.city;
      if (!cityId || !file.id) throw new Error('No se encontró la ciudad o el identificador del archivo');
      await httpsCallable(this.functions, 'deleteCityFile')( {cityId, fileId: file.id} );
    });

    await Promise.all(deletePromises);
  }

  async getFileById(id: string): Promise<FileClass | null> {
    return this.processGetFile(id, 'id');
  }

  private processGetFile(value: string, by: string): Promise<FileClass | null> {
    return new Promise<FileClass | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(file => {
          resolve(file ? new FileClass(file) : null);
        })
        .catch(() => {
          resolve(null);
        });
    });
  }
}
