import { inject, Injectable } from '@angular/core';
import { FirebaseRequest } from '@core/typescript/firebaseRequest';
import { FileI } from './file.model';
import { File } from './file.class';
import { UserService } from '../user/user.service';
import { fun } from '@core/services/functions.service';
import { AuthService } from '@core/services/auth.service';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { AngularFirestore } from '@angular/fire/compat/firestore';

@Injectable({
  providedIn: 'root',
})
export class FileService extends FirebaseRequest<FileI> {
  private _collectionName = 'files';
  private userService = inject(UserService);
  private authService = inject(AuthService);

  private storage = inject(AngularFireStorage);
  private firestore = inject(AngularFirestore);

  constructor() {
    super();
    this.firebaseCollectionName = this._collectionName;
  }

  get collectionName() {
    return this._collectionName;
  }

  saveMetaData(file: FileI) {
    const {fileData, ...fileMeta } = file;

    fileMeta.id = this.firestore.createId();

    return this.firestore.collection(this.collectionName).add(fileMeta);
  }

  async getFileById(id: string): Promise<File | null> {
    return this.processGetFile(id, 'id');
  }

  private processGetFile(value: string, by: string): Promise<File | null> {
    return new Promise<File | null>(resolve => {
      this._getOne({ find_by: by, find_value: value })
        .then(file => {
          console.log('%c file', 'color: blue; font-weight: bold;', file);
          resolve(file ? new File(file) : null);
        })
        .catch(error => {
          console.log(`ℹ️ [FileService] File no encontrado con ${by}: ${value}`);
          resolve(null);
        });
    });
  }

  createFile(newFile: FileI) {
    if (fun.isEmpty(this.authService.current_user())) throw new Error('User is not defined');

    return this.createOneInParentCollection({ parentCollection: this.userService.collectionName, parentId: this.authService.current_user()!.id, data: newFile });
  }
}
