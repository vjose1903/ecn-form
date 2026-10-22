import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import { Firestore, collection, getDocs, limit, orderBy, query } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { Ss } from '@core/services/singleton.service';

interface Choice {label: string; value: string}
interface RoleRecord {id: string; name: string; description?: string; is_active: boolean; permissions: Record<string, unknown>}
interface MemberRecord {uid: string; role_id: string; status: string; email?: string; display_name?: string; phone?: string}
interface AuditRecord {actor_uid: string; action: string; resource_path: string; occurred_at: any; changes: Record<string, unknown>}

@Component({
  selector: 'app-access-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule, TextareaModule],
  templateUrl: './access-management.html',
  styleUrl: './access-management.scss',
})
export class AccessManagement implements OnInit {
  private readonly db = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly auth = inject(Auth);
  readonly cities = signal<Choice[]>([]);
  readonly cityId = signal('');
  readonly roles = signal<RoleRecord[]>([]);
  readonly members = signal<MemberRecord[]>([]);
  readonly audit = signal<AuditRecord[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  roleId = '';
  roleName = '';
  roleDescription = '';
  permissionsJson = JSON.stringify({
    requests: {read: true, list: true, fields: {couple_basic: {read: true}, contact: {read: false}, identity: {read: false}}},
    payments: {read: false, list: false, create: false},
  }, null, 2);
  memberEmail = '';
  memberName = '';
  memberPhone = '';
  memberRoleId = '';
  get roleChoices(): Choice[] {
    return this.roles().map(role => ({label: role.name, value: role.id}));
  }

  async ngOnInit(): Promise<void> {
    await this.loadCities();
  }

  async loadCities(): Promise<void> {
    const user = Ss.authService.current_user();
    const token = await this.auth.currentUser?.getIdTokenResult();
    const superAdmin = token?.claims['super_admin'] === true;
    if (superAdmin) {
      const snapshot = await getDocs(collection(this.db, 'city'));
      this.cities.set(snapshot.docs.map(item => ({value: item.id, label: String(item.get('label') ?? item.id)})));
    } else if (user?.city) {
      this.cities.set([{value: user.city, label: user.cityData?.label || user.city}]);
    }
    const first = this.cities()[0]?.value ?? '';
    if (first) {
      this.changeCity(first);
    }
  }

  async loadCityData(): Promise<void> {
    const cityId = this.cityId();
    if (!cityId) return;
    this.loading.set(true);
    try {
      const [roleSnapshot, membersResult, auditSnapshot] = await Promise.all([
        getDocs(collection(this.db, `city/${cityId}/roles`)),
        httpsCallable<{cityId: string}, {members: MemberRecord[]}>(this.functions, 'listCityMembers')({cityId}),
        getDocs(query(collection(this.db, `city/${cityId}/audit_logs`), orderBy('occurred_at', 'desc'), limit(50))),
      ]);
      this.roles.set(roleSnapshot.docs.map(item => ({id: item.id, ...item.data()} as RoleRecord)));
      this.members.set(membersResult.data.members);
      const cityLogs = auditSnapshot.docs.map(item => item.data() as AuditRecord);
      if (Ss.authService.isSuperAdmin()) {
        const globalLogs = await getDocs(query(collection(this.db, 'global_audit_logs'), orderBy('occurred_at', 'desc'), limit(50)));
        cityLogs.push(...globalLogs.docs.map(item => item.data() as AuditRecord));
      }
      this.audit.set(cityLogs.sort((left, right) => (right.occurred_at?.toMillis?.() ?? 0) - (left.occurred_at?.toMillis?.() ?? 0)).slice(0, 50));
    } catch (error) {
      console.error('No se pudo cargar la administración de acceso:', JSON.stringify(error));
      Ss.toastService.error({title: 'Acceso restringido', message: 'Tu rol no tiene permiso para listar roles, equipo o auditoría.'});
    } finally {
      this.loading.set(false);
    }
  }

  changeCity(cityId: string): void {
    this.cityId.set(cityId);
    Ss.authService.activeCityId.set(cityId);
    void this.loadCityData();
  }

  editRole(role: RoleRecord): void {
    this.roleId = role.id;
    this.roleName = role.name;
    this.roleDescription = role.description ?? '';
    this.permissionsJson = JSON.stringify(role.permissions, null, 2);
  }

  async saveRole(): Promise<void> {
    try {
      const permissions = JSON.parse(this.permissionsJson) as Record<string, unknown>;
      this.saving.set(true);
      const save = httpsCallable(this.functions, 'saveCityRole');
      await save({cityId: this.cityId(), roleId: this.roleId, name: this.roleName, description: this.roleDescription, permissions});
      this.roleId = '';
      await this.loadCityData();
      Ss.toastService.success({title: 'Rol guardado', message: 'Los permisos quedaron actualizados.'});
    } catch (error) {
      console.error('No se pudo guardar el rol:', JSON.stringify(error));
      Ss.toastService.error({title: 'No se pudo guardar', message: error instanceof SyntaxError ? 'Revisa el formato JSON de los permisos.' : 'Verifica tus permisos y los datos del rol.'});
    } finally {
      this.saving.set(false);
    }
  }

  async createMember(): Promise<void> {
    try {
      this.saving.set(true);
      const create = httpsCallable(this.functions, 'createCityMember');
      await create({cityId: this.cityId(), email: this.memberEmail, displayName: this.memberName, phone: this.memberPhone, roleId: this.memberRoleId});
      await sendPasswordResetEmail(this.auth, this.memberEmail);
      this.memberEmail = this.memberName = this.memberPhone = this.memberRoleId = '';
      await this.loadCityData();
      Ss.toastService.success({title: 'Invitación enviada', message: 'El usuario recibirá un correo para definir su contraseña.'});
    } catch (error) {
      console.error('No se pudo crear el miembro:', JSON.stringify(error));
      Ss.toastService.error({title: 'No se pudo crear', message: 'Verifica el correo, el rol y los permisos de administración de miembros.'});
    } finally {
      this.saving.set(false);
    }
  }

  async updateMember(member: MemberRecord, patch: {roleId?: string; status?: string}): Promise<void> {
    try {
      const update = httpsCallable(this.functions, 'updateCityMember');
      await update({cityId: this.cityId(), uid: member.uid, ...patch});
      await this.loadCityData();
    } catch (error) {
      console.error('No se pudo actualizar el miembro:', JSON.stringify(error));
      Ss.toastService.error({title: 'No se pudo actualizar', message: 'Tu rol no permite realizar este cambio.'});
    }
  }

  formatTime(value: any): string {
    const date = value?.toDate?.() ?? (value instanceof Date ? value : null);
    return date ? date.toLocaleString('es-DO') : '';
  }
}
