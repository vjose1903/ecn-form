import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, doc, getDoc, getDocs } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputMaskModule } from 'primeng/inputmask';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { Ss } from '@core/services/singleton.service';

interface Choice {label: string; value: string}
interface RoleRecord {id: string; name: string; permissions?: {members?: {delete?: boolean}}}
interface MemberRecord {uid: string; role_id: string; status: string; email?: string; display_name?: string; phone?: string; super_admin?: boolean; has_signed_in?: boolean}
interface MemberCursor {uid: string; status: string}
interface MemberPage {members: MemberRecord[]; total?: number; hasNextPage?: boolean; firstCursor?: MemberCursor | null; lastCursor?: MemberCursor | null}
type PageDirection = 'first' | 'next' | 'previous' | 'last';
type MemberStatusFilter = 'all' | 'active' | 'disabled';

@Component({
  selector: 'app-users-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, InputMaskModule, SelectModule, DialogModule],
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
  readonly roleListUnavailable = signal(false);
  readonly members = signal<MemberRecord[]>([]);
  readonly loading = signal(false);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly totalMembers = signal(0);
  readonly hasNextPage = signal(false);
  readonly firstCursor = signal<MemberCursor | null>(null);
  readonly lastCursor = signal<MemberCursor | null>(null);
  readonly pageSizeOptions = [10, 20, 50, 100, 200].map(value => ({label: String(value), value}));
  readonly statusFilterOptions = [
    {label: 'Todos los estados', value: 'all'},
    {label: 'Activos', value: 'active'},
    {label: 'Desactivados', value: 'disabled'},
  ];
  readonly searchTerm = signal('');
  readonly statusFilter = signal<MemberStatusFilter>('all');
  readonly filtersExpanded = signal(false);
  private readonly currentUserRoleId = signal<string | null>(null);
  private legacyMembers: MemberRecord[] | null = null;
  readonly saving = signal(false);
  readonly editorVisible = signal(false);
  readonly editingMember = signal<MemberRecord | null>(null);
  readonly deletingMember = signal<MemberRecord | null>(null);
  readonly deletionError = signal('');
  readonly invitationMember = signal<MemberRecord | null>(null);
  readonly invitationError = signal('');
  readonly resendingInvitation = signal(false);
  memberEmail = '';
  memberName = '';
  memberPhone = '';
  memberRoleId = '';
  editEmail = '';
  editName = '';
  editPhone = '';
  editRoleId = '';
  editSuperAdmin = false;
  resendEmail = '';

  get canManageSuperAdmins(): boolean {
    return Ss.authService.isSuperAdmin();
  }

  get canDeleteMembers(): boolean {
    if (this.canManageSuperAdmins) return true;
    return this.roles().find(role => role.id === this.currentUserRoleId())?.permissions?.members?.delete === true;
  }

  get roleChoices(): Choice[] {
    return this.roles().map(role => ({label: role.name, value: role.id}));
  }

  roleName(roleId: string): string {
    return this.roles().find(role => role.id === roleId)?.name ?? roleId;
  }

  get filteredMembers(): MemberRecord[] {
    const search = this.searchTerm().trim().toLocaleLowerCase();
    const status = this.statusFilter();
    return this.members().filter(member => {
      const matchesStatus = status === 'all' || (status === 'active' ? member.status === 'active' : member.status !== 'active');
      const matchesSearch = !search || `${member.display_name ?? ''} ${member.email ?? ''} ${this.roleName(member.role_id)}`.toLocaleLowerCase().includes(search);
      return matchesStatus && matchesSearch;
    });
  }

  get hasActiveFilters(): boolean {
    return Boolean(this.searchTerm().trim()) || this.statusFilter() !== 'all';
  }

  get activeFiltersText(): string {
    const filters = [this.searchTerm().trim() ? `“${this.searchTerm().trim()}”` : ''];
    const selectedStatus = this.statusFilterOptions.find(option => option.value === this.statusFilter());
    if (selectedStatus && selectedStatus.value !== 'all') filters.push(selectedStatus.label);
    return filters.filter(Boolean).join(' · ');
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
  }

  toggleFilters(): void {
    this.filtersExpanded.update(expanded => !expanded);
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
    this.currentPage.set(1);
    this.totalMembers.set(0);
    this.members.set([]);
    this.roles.set([]);
    this.roleListUnavailable.set(false);
    this.legacyMembers = null;
    this.loading.set(true);
    try {
      const currentUid = this.auth.currentUser?.uid;
      const [rolesSnapshot, currentMember, membersResult] = await Promise.all([
        getDocs(collection(this.db, `city/${cityId}/roles`)).catch(error => {
          if (this.isPermissionDenied(error)) return null;
          throw error;
        }),
        currentUid && !this.canManageSuperAdmins ? getDoc(doc(this.db, `city/${cityId}/members/${currentUid}`)) : Promise.resolve(null),
        this.requestMembersPage(cityId, 'first', null),
      ]);
      this.roleListUnavailable.set(rolesSnapshot === null);
      if (rolesSnapshot) {
        this.roles.set(rolesSnapshot.docs.map(item => ({id: item.id, ...item.data()} as RoleRecord)));
      } else {
        const roleIds = [...new Set([currentMember?.get('role_id'), ...membersResult.data.members.map(member => member.role_id)].filter((id): id is string => typeof id === 'string' && !!id))];
        const relatedRoles = await Promise.all(roleIds.map(async id => {
          try {
            const snapshot = await getDoc(doc(this.db, `city/${cityId}/roles/${id}`));
            return {id, name: snapshot.exists() ? String(snapshot.get('name') ?? id) : id} as RoleRecord;
          } catch (error) {
            if (this.isPermissionDenied(error)) return {id, name: id} as RoleRecord;
            throw error;
          }
        }));
        this.roles.set(relatedRoles);
      }
      this.currentUserRoleId.set(currentMember?.get('role_id') ?? null);
      this.applyMembersPage(membersResult.data, 1);
    } catch (error) {
      console.error('No se pudo cargar el equipo de la ciudad:', JSON.stringify(error));
      Ss.toastService.error({title: 'Acceso restringido', message: 'Tu rol no tiene permiso para listar miembros o roles.'});
    } finally {
      this.loading.set(false);
    }
  }

  private isPermissionDenied(error: unknown): boolean {
    return ['permission-denied', 'firestore/permission-denied'].includes((error as {code?: string})?.code ?? '');
  }

  private requestMembersPage(cityId: string, direction: PageDirection, cursor: MemberCursor | null) {
    return httpsCallable<
      {cityId: string; pageSize: number; direction: PageDirection; cursor: MemberCursor | null; includeTotal: boolean},
      MemberPage
    >(this.functions, 'listCityMembers')({cityId, pageSize: this.pageSize(), direction, cursor, includeTotal: direction === 'last'});
  }

  private applyMembersPage(page: MemberPage, pageNumber: number): void {
    if (page.firstCursor === undefined) {
      this.legacyMembers = page.members;
      this.totalMembers.set(page.members.length);
      const pageCount = Math.max(1, Math.ceil(page.members.length / this.pageSize()));
      const selectedPage = Math.min(pageNumber, pageCount);
      const start = (selectedPage - 1) * this.pageSize();
      this.currentPage.set(selectedPage);
      this.hasNextPage.set(selectedPage < pageCount);
      this.firstCursor.set(null);
      this.lastCursor.set(null);
      this.members.set(page.members.slice(start, start + this.pageSize()));
      return;
    }
    this.legacyMembers = null;
    if (Number.isFinite(page.total)) this.totalMembers.set(page.total!);
    this.currentPage.set(pageNumber);
    this.hasNextPage.set(page.hasNextPage ?? (Number.isFinite(page.total) && pageNumber < Math.ceil(page.total! / this.pageSize())));
    this.firstCursor.set(page.firstCursor ?? null);
    this.lastCursor.set(page.lastCursor ?? null);
    const currentUid = this.auth.currentUser?.uid;
    this.members.set(page.members.map(member => ({
      ...member,
      super_admin: member.uid === currentUid && this.canManageSuperAdmins ? true : member.super_admin ?? false,
    })));
  }

  async goToFirstPage(): Promise<void> {
    await this.goToPage('first', null, 1);
  }

  async goToPreviousPage(): Promise<void> {
    const cursor = this.firstCursor();
    if (this.currentPage() > 1 && (cursor || this.legacyMembers)) await this.goToPage('previous', cursor, this.currentPage() - 1);
  }

  async goToNextPage(): Promise<void> {
    const cursor = this.lastCursor();
    if (this.hasNextPage() && (cursor || this.legacyMembers)) await this.goToPage('next', cursor, this.currentPage() + 1);
  }

  async goToLastPage(): Promise<void> {
    if (this.hasNextPage() && (this.lastCursor() || this.legacyMembers)) await this.goToPage('last', null, Math.max(this.currentPage() + 1, Math.ceil(this.totalMembers() / this.pageSize())));
  }

  changePageSize(pageSize: number): void {
    if (this.pageSizeOptions.some(option => option.value === pageSize) && pageSize !== this.pageSize()) {
      this.pageSize.set(pageSize);
      void this.goToPage('first', null, 1);
    }
  }

  private async goToPage(direction: PageDirection, cursor: MemberCursor | null, pageNumber: number): Promise<void> {
    if (this.loading() || !this.cityId()) return;
    if (this.legacyMembers) {
      this.applyMembersPage({members: this.legacyMembers}, pageNumber);
      return;
    }
    this.loading.set(true);
    try {
      const result = await this.requestMembersPage(this.cityId(), direction, cursor);
      if (direction !== 'last' && pageNumber > 1 && !result.data.members.length) {
        const lastResult = await this.requestMembersPage(this.cityId(), 'last', null);
        const lastPage = Math.max(1, Math.ceil((lastResult.data.total ?? lastResult.data.members.length) / this.pageSize()));
        this.applyMembersPage(lastResult.data, lastPage);
        return;
      }
      const selectedPage = direction === 'last' && Number.isFinite(result.data.total)
        ? Math.max(1, Math.ceil(result.data.total! / this.pageSize()))
        : pageNumber;
      this.applyMembersPage(result.data, selectedPage);
    } catch (error) {
      console.error('No se pudo cargar la página de usuarios:', JSON.stringify(error));
      Ss.toastService.error({title: 'Error de carga', message: 'No se pudo cargar la página de usuarios.'});
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

  openResendInvitation(member: MemberRecord): void {
    this.invitationError.set('');
    this.resendEmail = member.email ?? '';
    this.invitationMember.set(member);
  }

  closeResendInvitation(): void {
    if (this.resendingInvitation()) return;
    this.invitationMember.set(null);
    this.invitationError.set('');
    this.resendEmail = '';
  }

  onResendDialogVisibleChange(visible: boolean): void {
    if (visible) return;
    this.closeResendInvitation();
  }

  async resendInvitation(): Promise<void> {
    const member = this.invitationMember();
    if (!member || this.resendingInvitation()) return;
    this.invitationError.set('');
    this.resendingInvitation.set(true);
    try {
      const resend = httpsCallable<
        {cityId: string; uid: string; email: string},
        {uid: string; email: string}
      >(this.functions, 'resendCityMemberInvitation');
      const result = await resend({cityId: this.cityId(), uid: member.uid, email: this.resendEmail.trim()});
      this.invitationMember.set(null);
      this.resendEmail = '';
      Ss.toastService.success({title: 'Correo en proceso', message: `Se está preparando el enlace para ${result.data.email}.`});
      void this.loadCityData();
    } catch (error) {
      console.error('No se pudo reenviar la invitación:', JSON.stringify(error));
      const message = error instanceof Error ? error.message : 'Verifica el correo y los permisos para administrar usuarios.';
      this.invitationError.set(message);
      Ss.toastService.error({title: 'No se pudo reenviar', message});
    } finally {
      this.resendingInvitation.set(false);
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
