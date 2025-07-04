import { inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebase/firebaseRequest';
import { FileI } from './file.model';
import { FileClass } from './file.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';

@Injectable({
  providedIn: 'root',
})
export class FileService extends FirebaseRequest<FileI> {
  private _collectionName = 'files';
  private userService = inject(UserService);
  private authService = inject(AuthService);

  private storage = inject(Storage);

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
      return await runInInjectionContext(this.injector, async () => {
        const storageRef = ref(this.storage, filePayload.fileStoragePath);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        fileMeta.url = url;
        const fileData = await this._createOne({ data: fileMeta });
        return new FileClass(fileData);
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
      await this._deleteOne({ find_value: file.id });

      const storageRef = ref(this.storage, file.fileStoragePath);
      await deleteObject(storageRef);
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
        .catch(error => {
          resolve(null);
        });
    });
  }

  createFile(newFile: FileI) {
    if (fun.isEmpty(this.authService.current_user())) throw new Error('User is not defined');

    return this.createOneInParentCollection({ parentCollection: this.userService.collectionName, parentId: this.authService.current_user()!.id, data: newFile });
  }
}
