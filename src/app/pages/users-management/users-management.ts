import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { Ss } from '@core/services/singleton.service';

interface Choice {label: string; value: string}
interface RoleRecord {id: string; name: string; permissions?: {members?: {delete?: boolean}}}
interface MemberRecord {uid: string; role_id: string; status: string; email?: string; display_name?: string; phone?: string; super_admin?: boolean}

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule, DialogModule],
  templateUrl: './users-management.html',
  styleUrl: './users-management.scss',
})
export class UsersManagement implements OnInit {
  @ViewChild('createMemberForm') private createMemberForm?: NgForm;
  @ViewChild('editMemberForm') private editMemberForm?: NgForm;
  private readonly db = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly auth = inject(Auth);
  readonly cities = signal<Choice[]>([]);
  readonly cityId = signal('');
  readonly roles = signal<RoleRecord[]>([]);
  readonly members = signal<MemberRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editorVisible = signal(false);
  readonly editingMember = signal<MemberRecord | null>(null);
  readonly deletingMember = signal<MemberRecord | null>(null);
  readonly deletionError = signal('');
  memberEmail = '';
  memberName = '';
  memberPhone = '';
  memberRoleId = '';
  editEmail = '';
  editName = '';
  editPhone = '';
  editRoleId = '';
  editSuperAdmin = false;

  get canManageSuperAdmins(): boolean {
    return Ss.authService.isSuperAdmin();
  }

  get canDeleteMembers(): boolean {
    if (this.canManageSuperAdmins) return true;
    const currentUid = this.auth.currentUser?.uid;
    const currentMember = this.members().find(member => member.uid === currentUid);
    return this.roles().find(role => role.id === currentMember?.role_id)?.permissions?.members?.delete === true;
  }

  get roleChoices(): Choice[] {
    return this.roles().map(role => ({label: role.name, value: role.id}));
  }

  roleName(roleId: string): string {
    return this.roles().find(role => role.id === roleId)?.name ?? roleId;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCities();
  }

  private async loadCities(): Promise<void> {
    const user = Ss.authService.current_user();
    const token = await this.auth.currentUser?.getIdTokenResult();
    if (token?.claims['super_admin'] === true) {
      const snapshot = await getDocs(collection(this.db, 'city'));
      this.cities.set(snapshot.docs.map(item => ({value: item.id, label: String(item.get('label') ?? item.id)})));
    } else if (user?.city) {
      this.cities.set([{value: user.city, label: user.cityData?.label || user.city}]);
    }
    const activeCityId = Ss.authService.activeCityId();
    const selectedCity = this.cities().find(city => city.value === activeCityId)?.value ?? this.cities()[0]?.value ?? '';
    if (selectedCity) this.changeCity(selectedCity);
  }

  changeCity(cityId: string): void {
    this.cityId.set(cityId);
    Ss.authService.activeCityId.set(cityId);
    void this.loadCityData();
  }

  private async loadCityData(): Promise<void> {
    const cityId = this.cityId();
    if (!cityId) return;
    this.loading.set(true);
    try {
      const [rolesSnapshot, membersResult] = await Promise.all([
        getDocs(collection(this.db, `city/${cityId}/roles`)),
        httpsCallable<{cityId: string}, {members: MemberRecord[]}>(this.functions, 'listCityMembers')({cityId}),
      ]);
      this.roles.set(rolesSnapshot.docs.map(item => ({id: item.id, ...item.data()} as RoleRecord)));
      const currentUid = this.auth.currentUser?.uid;
      this.members.set(membersResult.data.members.map(member => ({
        ...member,
        super_admin: member.uid === currentUid && this.canManageSuperAdmins ? true : member.super_admin ?? false,
      })));
    } catch (error) {
      console.error('No se pudo cargar el equipo de la ciudad:', JSON.stringify(error));
      Ss.toastService.error({title: 'Acceso restringido', message: 'Tu rol no tiene permiso para listar miembros o roles.'});
    } finally {
      this.loading.set(false);
    }
  }

  async createMember(): Promise<boolean> {
    try {
      this.saving.set(true);
      const create = httpsCallable<
        {cityId: string; email: string; displayName: string; phone: string; roleId: string},
        {uid: string; email: string; reactivated: boolean}
      >(this.functions, 'createCityMember');
      const result = await create({cityId: this.cityId(), email: this.memberEmail, displayName: this.memberName, phone: this.memberPhone, roleId: this.memberRoleId});
      this.closeEditor();
      Ss.toastService.success(result.data.reactivated
        ? {title: 'Cuenta reactivada', message: 'Se restauró el acceso de la cuenta existente y se asignó el rol de esta ciudad.'}
        : {title: 'Usuario creado', message: 'El correo para definir su contraseña se está enviando en segundo plano.'});
      void this.loadCityData();
      return true;
    } catch (error) {
      console.error('No se pudo crear el miembro:', JSON.stringify(error));
      Ss.toastService.error({title: 'No se pudo crear', message: 'Verifica el correo, el rol y los permisos de administración de miembros.'});
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  openCreate(): void {
    this.editingMember.set(null);
    this.resetEditorForms();
    this.editorVisible.set(true);
  }

  openEdit(member: MemberRecord): void {
    this.editingMember.set(member);
    this.editEmail = member.email ?? '';
    this.editName = member.display_name ?? '';
    this.editPhone = member.phone ?? '';
    this.editRoleId = member.role_id;
    this.editSuperAdmin = member.super_admin === true;
    this.editorVisible.set(true);
  }

  async saveMemberEdit(): Promise<void> {
    const member = this.editingMember();
    if (!member) return;
    const saved = await this.updateMember(member, {
      displayName: this.editName,
      email: this.editEmail,
      phone: this.editPhone,
      roleId: this.editRoleId,
      ...(this.canManageSuperAdmins && this.editSuperAdmin !== (member.super_admin === true) ? {superAdmin: this.editSuperAdmin} : {}),
    });
    if (saved) this.closeEditor();
  }

  onEditorVisibleChange(visible: boolean): void {
    if (visible) this.editorVisible.set(true);
    else this.closeEditor();
  }

  closeEditor(): void {
    this.resetEditorForms();
    this.editName = this.editEmail = this.editPhone = this.editRoleId = '';
    this.editSuperAdmin = false;
    this.editingMember.set(null);
    this.editorVisible.set(false);
  }

  private resetEditorForms(): void {
    this.memberName = this.memberEmail = this.memberPhone = this.memberRoleId = '';
    this.createMemberForm?.resetForm({memberName: '', memberEmail: '', memberPhone: '', memberRole: ''});
    this.editMemberForm?.resetForm({editName: '', editEmail: '', editPhone: '', editRole: '', editSuperAdmin: false});
  }

  confirmMemberStatusChange(member: MemberRecord): void {
    if (member.status !== 'active') {
      void this.updateMember(member, {status: 'active'});
      return;
    }

    const name = member.display_name || member.email || 'este usuario';
    Ss.confirmationService.confirm({
      header: 'Desactivar usuario',
      message: `¿Seguro que deseas desactivar a ${name}? No podrá acceder a la plataforma.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      acceptIcon: 'pi pi-user-minus',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => { void this.updateMember(member, {status: 'disabled'}); },
    });
  }

  isProtectedFromDeletion(member: MemberRecord): boolean {
    return member.uid === this.auth.currentUser?.uid || member.super_admin === true;
  }

  confirmMemberDeletion(member: MemberRecord): void {
    this.deletionError.set('');
    this.deletingMember.set(member);
  }

  onDeletionDialogVisibleChange(visible: boolean): void {
    if (!visible && !this.saving()) this.deletingMember.set(null);
  }

  async deleteMember(): Promise<void> {
    const member = this.deletingMember();
    if (!member || this.saving()) return;
    this.deletionError.set('');
    try {
      this.saving.set(true);
      const remove = httpsCallable<{cityId: string; uid: string}, {mode: 'hard' | 'soft'}>(this.functions, 'deleteCityMember');
      const result = await remove({cityId: this.cityId(), uid: member.uid});
      await this.loadCityData();
      this.deletingMember.set(null);
      Ss.toastService.success({
        title: result.data.mode === 'hard' ? 'Cuenta eliminada' : 'Usuario eliminado de la ciudad',
        message: result.data.mode === 'hard'
          ? 'Se eliminó la cuenta porque no tenía actividad ni otras ciudades asignadas.'
          : 'Se conservaron la cuenta y sus registros; se retiró el acceso a esta ciudad.',
      });
    } catch (error) {
      console.error('No se pudo eliminar el miembro:', JSON.stringify(error));
      const details = error && typeof error === 'object' && 'details' in error ? error.details : undefined;
      const message = typeof details === 'string'
        ? details
        : error instanceof Error ? error.message : 'Intenta nuevamente o contacta al administrador.';
      this.deletionError.set(message);
      Ss.toastService.error({title: 'No se pudo eliminar', message});
    } finally {
      this.saving.set(false);
    }
  }

  async updateMember(member: MemberRecord, patch: {roleId?: string; status?: string; displayName?: string; email?: string; phone?: string; superAdmin?: boolean}): Promise<boolean> {
    try {
      this.saving.set(true);
      const update = httpsCallable(this.functions, 'updateCityMember');
      await update({cityId: this.cityId(), uid: member.uid, ...patch});
      await this.loadCityData();
      return true;
    } catch (error) {
      console.error('No se pudo actualizar el miembro:', JSON.stringify(error));
      Ss.toastService.error({title: 'No se pudo actualizar', message: 'Tu rol no permite realizar este cambio.'});
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
