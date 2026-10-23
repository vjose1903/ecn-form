import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Ss } from '@core/services/singleton.service';

interface Choice {label: string; value: string}
interface RoleRecord {id: string; name: string; description?: string; is_active?: boolean; permissions: Record<string, unknown>}
type RoleStatusFilter = 'all' | 'active' | 'inactive';
interface PermissionAction {key: string; label: string; description: string}
interface PermissionSection {key: string; label: string}
interface PermissionResource {key: string; label: string; description: string; icon: string; actions: PermissionAction[]; fields?: PermissionSection[]}

const DEFAULT_PERMISSIONS: Record<string, unknown> = {
  requests: {read: true, list: true, fields: {couple_basic: {read: true}, contact: {read: false}, identity: {read: false}}},
  payments: {read: false, list: false, create: false},
};

const action = (key: string, label: string, description: string): PermissionAction => ({key, label, description});

@Component({
  selector: 'app-access-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule],
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
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly roleDialogVisible = signal(false);
  readonly roleFormError = signal('');
  readonly selectedPermissionResource = signal('retreats');
  readonly permissionSearch = signal('');
  readonly permissionListDragging = signal(false);
  readonly searchTerm = signal('');
  readonly statusFilter = signal<RoleStatusFilter>('all');
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50, 100, 200].map(value => ({label: String(value), value}));
  readonly requestFieldActions = [
    action('read', 'Ver', 'Consultar esta información.'),
    action('update', 'Editar', 'Modificar esta información.'),
  ];
  readonly permissionResources: PermissionResource[] = [
    {key: 'members', label: 'Usuarios', description: 'Cuentas y accesos de los usuarios.', icon: 'pi pi-users', actions: [action('read', 'Ver', 'Consultar el perfil de un usuario.'), action('list', 'Listar', 'Ver el listado de usuarios.'), action('create', 'Crear', 'Crear cuentas de usuario.'), action('update', 'Editar', 'Modificar los datos de usuarios.'), action('disable', 'Activar o desactivar', 'Cambiar el acceso de un usuario.'), action('delete', 'Eliminar', 'Quitar usuarios de la ciudad.'), action('assign_role', 'Asignar roles', 'Cambiar el rol de un usuario.')]},
    {key: 'roles', label: 'Roles y permisos', description: 'Roles disponibles y sus permisos.', icon: 'pi pi-shield', actions: [action('read', 'Ver', 'Consultar un rol.'), action('list', 'Listar', 'Ver los roles disponibles.'), action('create', 'Crear', 'Crear roles.'), action('update', 'Editar', 'Cambiar roles y permisos.'), action('delete', 'Eliminar', 'Eliminar roles.')]},
    {key: 'retreat_homes', label: 'Casas de retiro', description: 'Casas de retiro y sus asignaciones.', icon: 'pi pi-home', actions: [action('read', 'Ver', 'Consultar una casa de retiro.'), action('list', 'Listar', 'Ver casas de retiro.'), action('create', 'Crear', 'Registrar casas de retiro.'), action('assign', 'Asignar', 'Asignar casas de retiro a la ciudad.'), action('update', 'Editar', 'Modificar casas de retiro.'), action('unassign', 'Desasignar', 'Quitar una casa de la ciudad.')]},
    {key: 'retreats', label: 'Retiros', description: 'Retiros organizados por la ciudad.', icon: 'pi pi-calendar', actions: [action('read', 'Ver', 'Consultar un retiro.'), action('list', 'Listar', 'Ver los retiros.'), action('create', 'Crear', 'Crear retiros.'), action('update', 'Editar', 'Modificar retiros.'), action('delete', 'Eliminar', 'Eliminar retiros.')]},
    {key: 'requests', label: 'Solicitudes', description: 'Solicitudes, historial y datos de las parejas.', icon: 'pi pi-file-edit', actions: [action('read', 'Ver', 'Consultar solicitudes.'), action('list', 'Listar', 'Ver el listado de solicitudes.'), action('update', 'Editar', 'Modificar solicitudes.'), action('delete', 'Eliminar', 'Eliminar solicitudes.'), action('archive', 'Archivar', 'Archivar solicitudes.'), action('unarchive', 'Restaurar', 'Restaurar solicitudes archivadas.'), action('transfer', 'Transferir', 'Transferir solicitudes.'), action('history_read', 'Ver historial', 'Consultar detalles de un evento del historial.'), action('history_list', 'Listar historial', 'Ver el historial de cambios.'), action('history_delete', 'Eliminar del historial', 'Eliminar eventos del historial.')], fields: [
      {key: 'couple_basic', label: 'Datos básicos de la pareja'}, {key: 'contact', label: 'Contacto'}, {key: 'identity', label: 'Identidad'}, {key: 'family', label: 'Familia'}, {key: 'relationship', label: 'Relación'}, {key: 'invitation', label: 'Invitación'}, {key: 'status', label: 'Estado de solicitud'}, {key: 'informed', label: 'Estado de información'}, {key: 'legacy_extra', label: 'Datos adicionales'},
    ]},
    {key: 'payments', label: 'Pagos', description: 'Pagos asociados a las solicitudes.', icon: 'pi pi-wallet', actions: [action('read', 'Ver', 'Consultar un pago.'), action('list', 'Listar', 'Ver pagos.'), action('create', 'Registrar', 'Registrar pagos.'), action('update', 'Editar', 'Modificar pagos.'), action('delete', 'Eliminar', 'Eliminar pagos.')]},
    {key: 'audit', label: 'Auditoría', description: 'Registro de acciones y cambios.', icon: 'pi pi-history', actions: [action('read', 'Ver', 'Consultar un evento de auditoría.'), action('list', 'Listar', 'Ver el registro de auditoría.')]},
  ];
  readonly statusFilterOptions = [
    {label: 'Todos los estados', value: 'all'},
    {label: 'Activos', value: 'active'},
    {label: 'Inactivos', value: 'inactive'},
  ];
  roleId = '';
  roleName = '';
  roleDescription = '';
  readonly permissions = signal<Record<string, unknown>>(this.clonePermissions(DEFAULT_PERMISSIONS));
  private permissionDragPointerId: number | null = null;
  private permissionDragStartX = 0;
  private permissionDragStartScrollLeft = 0;
  private permissionDragCaptureTarget: HTMLElement | null = null;
  private permissionDragMoved = false;
  private ignorePermissionClick = false;

  private get derivedRoleId(): string {
    return this.roleName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  get roleNameError(): string {
    if (this.roleId) return '';
    if (!this.roleName.trim()) return '';
    if (!this.derivedRoleId) return 'Escribe un nombre válido para el rol.';
    if (this.derivedRoleId.length > 60) return 'El nombre genera un identificador demasiado largo.';
    if (this.roles().some(role => role.id === this.derivedRoleId)) return 'Ya existe un rol con este nombre. Usa otro nombre para el rol.';
    return '';
  }

  get visiblePermissionResources(): PermissionResource[] {
    const term = this.permissionSearch().trim().toLocaleLowerCase();
    return this.permissionResources.filter(resource => !term || `${resource.label} ${resource.description}`.toLocaleLowerCase().includes(term));
  }

  get selectedResource(): PermissionResource | undefined {
    return this.permissionResources.find(resource => resource.key === this.selectedPermissionResource());
  }

  get filteredRoles(): RoleRecord[] {
    const search = this.searchTerm().trim().toLocaleLowerCase();
    const status = this.statusFilter();
    return this.roles().filter(role => {
      const active = role.is_active !== false;
      const matchesStatus = status === 'all' || (status === 'active' ? active : !active);
      const matchesSearch = !search || `${role.name} ${role.description ?? ''}`.toLocaleLowerCase().includes(search);
      return matchesStatus && matchesSearch;
    });
  }

  get pagedRoles(): RoleRecord[] {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredRoles.slice(start, start + this.pageSize());
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredRoles.length / this.pageSize()));
  }

  get hasActiveFilters(): boolean {
    return Boolean(this.searchTerm().trim()) || this.statusFilter() !== 'all';
  }

  get activeFiltersText(): string {
    const parts = [this.searchTerm().trim() ? `“${this.searchTerm().trim()}”` : ''];
    const status = this.statusFilterOptions.find(option => option.value === this.statusFilter());
    if (status && status.value !== 'all') parts.push(status.label);
    return parts.filter(Boolean).join(' · ');
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
    if (first) this.changeCity(first);
  }

  async loadCityData(): Promise<void> {
    const cityId = this.cityId();
    if (!cityId) return;
    this.loading.set(true);
    try {
      const snapshot = await getDocs(collection(this.db, `city/${cityId}/roles`));
      this.roles.set(snapshot.docs.map(item => ({id: item.id, ...item.data()} as RoleRecord)));
      this.currentPage.set(1);
    } catch (error) {
      console.error('No se pudieron cargar los roles:', JSON.stringify(error));
      Ss.toastService.error({title: 'Acceso restringido', message: 'Tu rol no tiene permiso para listar los roles de esta ciudad.'});
    } finally {
      this.loading.set(false);
    }
  }

  changeCity(cityId: string): void {
    this.cityId.set(cityId);
    Ss.authService.activeCityId.set(cityId);
    void this.loadCityData();
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  onStatusFilterChange(value: RoleStatusFilter): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
    this.currentPage.set(1);
  }

  previousPage(): void {
    this.currentPage.update(page => Math.max(1, page - 1));
  }

  nextPage(): void {
    this.currentPage.update(page => Math.min(this.pageCount, page + 1));
  }

  openCreateRole(): void {
    this.roleId = '';
    this.roleName = '';
    this.roleDescription = '';
    this.permissions.set(this.clonePermissions(DEFAULT_PERMISSIONS));
    this.selectedPermissionResource.set('retreats');
    this.permissionSearch.set('');
    this.roleFormError.set('');
    this.roleDialogVisible.set(true);
  }

  editRole(role: RoleRecord): void {
    this.roleId = role.id;
    this.roleName = role.name;
    this.roleDescription = role.description ?? '';
    this.permissions.set(this.clonePermissions(role.permissions));
    this.selectedPermissionResource.set('retreats');
    this.permissionSearch.set('');
    this.roleFormError.set('');
    this.roleDialogVisible.set(true);
  }

  closeRoleDialog(): void {
    if (this.saving()) return;
    this.roleDialogVisible.set(false);
    this.roleFormError.set('');
  }

  async saveRole(): Promise<void> {
    if (this.roleNameError) return;
    this.roleFormError.set('');
    this.saving.set(true);
    try {
      const save = httpsCallable(this.functions, 'saveCityRole');
      await save({cityId: this.cityId(), roleId: this.roleId, name: this.roleName, description: this.roleDescription, permissions: this.permissions()});
      this.roleDialogVisible.set(false);
      await this.loadCityData();
      Ss.toastService.success({title: 'Rol guardado', message: 'Los permisos quedaron actualizados.'});
    } catch (error) {
      console.error('No se pudo guardar el rol:', JSON.stringify(error));
      this.roleFormError.set('No se pudo guardar. Verifica tus permisos y los datos del rol.');
      Ss.toastService.error({title: 'No se pudo guardar', message: 'Verifica tus permisos y los datos del rol.'});
    } finally {
      this.saving.set(false);
    }
  }

  isPermissionEnabled(resourceKey: string, actionKey: string, fieldKey?: string): boolean {
    const resource = this.asRecord(this.permissions()[resourceKey]);
    const value = fieldKey
      ? this.asRecord(this.asRecord(resource?.['fields'])?.[fieldKey])?.[actionKey]
      : resource?.[actionKey];
    return value === true;
  }

  permissionCount(resource: PermissionResource): {selected: number; total: number} {
    const items = [
      ...resource.actions.map(permission => this.isPermissionEnabled(resource.key, permission.key)),
      ...(resource.fields ?? []).flatMap(field => this.requestFieldActions.map(permission => this.isPermissionEnabled(resource.key, permission.key, field.key))),
    ];
    return {selected: items.filter(Boolean).length, total: items.length};
  }

  areAllResourcePermissionsEnabled(resource: PermissionResource): boolean {
    const {selected, total} = this.permissionCount(resource);
    return total > 0 && selected === total;
  }

  toggleAllResourcePermissions(resource: PermissionResource, enabled: boolean): void {
    for (const permission of resource.actions) this.setPermission(resource.key, permission.key, enabled);
    for (const field of resource.fields ?? []) {
      for (const permission of this.requestFieldActions) this.setPermission(resource.key, permission.key, enabled, field.key);
    }
  }

  onPermissionSearchChange(value: string): void {
    this.permissionSearch.set(value);
    const visible = this.visiblePermissionResources;
    if (visible.length && !visible.some(resource => resource.key === this.selectedPermissionResource())) {
      this.selectedPermissionResource.set(visible[0].key);
    }
  }

  selectPermissionResource(resourceKey: string): void {
    if (this.ignorePermissionClick) {
      this.ignorePermissionClick = false;
      return;
    }
    this.selectedPermissionResource.set(resourceKey);
  }

  onPermissionListPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const list = event.currentTarget as HTMLElement;
    this.permissionDragPointerId = event.pointerId;
    this.permissionDragStartX = event.clientX;
    this.permissionDragStartScrollLeft = list.scrollLeft;
    this.permissionDragMoved = false;
    this.permissionDragCaptureTarget = (event.target as HTMLElement).closest('button') ?? list;
    this.permissionDragCaptureTarget.setPointerCapture(event.pointerId);
  }

  onPermissionListPointerMove(event: PointerEvent): void {
    if (this.permissionDragPointerId !== event.pointerId) return;
    const distance = event.clientX - this.permissionDragStartX;
    if (Math.abs(distance) > 5) {
      this.permissionDragMoved = true;
      this.permissionListDragging.set(true);
      event.preventDefault();
    }
    if (this.permissionDragMoved) {
      const list = event.currentTarget as HTMLElement;
      list.scrollLeft = this.permissionDragStartScrollLeft - distance;
    }
  }

  onPermissionListPointerUp(event: PointerEvent): void {
    if (this.permissionDragPointerId !== event.pointerId) return;
    const captureTarget = this.permissionDragCaptureTarget;
    if (captureTarget?.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
    this.permissionDragCaptureTarget = null;
    this.permissionDragPointerId = null;
    this.permissionListDragging.set(false);
    if (this.permissionDragMoved) {
      this.ignorePermissionClick = true;
      setTimeout(() => this.ignorePermissionClick = false, 0);
    }
    this.permissionDragMoved = false;
  }

  setPermission(resourceKey: string, actionKey: string, enabled: boolean, fieldKey?: string): void {
    const permissions = {...this.permissions()};
    const resource = {...(this.asRecord(permissions[resourceKey]) ?? {})};
    if (fieldKey) {
      const fields = {...(this.asRecord(resource['fields']) ?? {})};
      fields[fieldKey] = {...(this.asRecord(fields[fieldKey]) ?? {}), [actionKey]: enabled};
      resource['fields'] = fields;
    } else {
      resource[actionKey] = enabled;
    }
    permissions[resourceKey] = resource;
    this.permissions.set(permissions);
    this.roleFormError.set('');
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private clonePermissions(value: Record<string, unknown>): Record<string, unknown> {
    const permissions = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    delete permissions['files'];
    delete permissions['city'];
    const requests = this.asRecord(permissions['requests']);
    if (requests) {
      delete requests['create'];
      const fields = this.asRecord(requests['fields']);
      for (const field of Object.values(fields ?? {})) {
        const actions = this.asRecord(field);
        if (actions) delete actions['create'];
      }
    }
    return permissions;
  }
}
