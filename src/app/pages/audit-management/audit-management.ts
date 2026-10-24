import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, collection, getDocs, limit, orderBy, query } from '@angular/fire/firestore';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Ss } from '@core/services/singleton.service';

interface Choice {label: string; value: string}
interface AuditChange {before: unknown; after: unknown}
interface AuditRecord {
  id: string;
  actor_uid: string;
  actor_type?: string;
  action: string;
  resource_path: string;
  resource_type?: string;
  resource_id?: string;
  occurred_at: any;
  changes: Record<string, AuditChange | unknown>;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', label: 'Nombre', display_name: 'Nombre', first_name: 'Nombre', last_name: 'Apellido',
  email: 'Correo electrónico', phone: 'Teléfono', status: 'Estado', role_id: 'Rol', city: 'Ciudad',
  city_id: 'Ciudad', retreat_id: 'Retiro', retreat_home_id: 'Casa de retiro', is_informado: 'Información recibida',
  amount: 'Monto', description: 'Descripción', start_date: 'Fecha de inicio', end_date: 'Fecha de fin',
  deadline: 'Fecha límite', created_at: 'Fecha de creación', updated_at: 'Última actualización',
  created_by: 'Creado por', updated_by: 'Actualizado por', actor_uid: 'Usuario',
};
const RESOURCE_LABELS: Record<string, string> = {
  city: 'Ciudad', roles: 'Rol', members: 'Usuario', retreat: 'Retiro', requests: 'Solicitud',
  details: 'Datos de solicitud', payments: 'Pago', history: 'Historial', retreat_homes: 'Casa de retiro',
  push_tokens: 'Token push', user: 'Usuario',
};

@Component({
  selector: 'app-audit-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './audit-management.html',
  styleUrl: './audit-management.scss',
})
export class AuditManagement implements OnInit {
  private readonly db = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly functions = inject(Functions);
  readonly cities = signal<Choice[]>([]);
  readonly cityId = signal('');
  readonly audit = signal<AuditRecord[]>([]);
  readonly loading = signal(false);
  readonly searchTerm = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly expandedEvents = signal<Set<string>>(new Set());
  readonly actorNames = signal<Record<string, string>>({});
  readonly pageSizeOptions = [10, 20, 50].map(value => ({label: String(value), value}));

  get filteredAudit(): AuditRecord[] {
    const search = this.searchTerm().trim().toLocaleLowerCase();
    return this.audit().filter(event => !search || `${this.actorLabel(event)} ${event.actor_uid} ${event.action} ${event.resource_path} ${JSON.stringify(event.changes ?? {})}`.toLocaleLowerCase().includes(search));
  }

  get pagedAudit(): AuditRecord[] {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredAudit.slice(start, start + this.pageSize());
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredAudit.length / this.pageSize()));
  }

  async ngOnInit(): Promise<void> {
    await this.loadCities();
  }

  async loadCities(): Promise<void> {
    const user = Ss.authService.current_user();
    const token = await this.auth.currentUser?.getIdTokenResult();
    if (token?.claims['super_admin'] === true) {
      const snapshot = await getDocs(collection(this.db, 'city'));
      this.cities.set(snapshot.docs.map(item => ({value: item.id, label: String(item.get('label') ?? item.id)})));
    } else if (user?.city) {
      this.cities.set([{value: user.city, label: user.cityData?.label || user.city}]);
    }
    const first = this.cities()[0]?.value ?? '';
    if (first) this.changeCity(first);
  }

  changeCity(cityId: string): void {
    this.cityId.set(cityId);
    Ss.authService.activeCityId.set(cityId);
    void this.loadAudit();
  }

  async loadAudit(): Promise<void> {
    const cityId = this.cityId();
    if (!cityId) return;
    this.loading.set(true);
    try {
      const citySnapshot = await getDocs(query(collection(this.db, `city/${cityId}/audit_logs`), orderBy('occurred_at', 'desc'), limit(50)));
      const events = citySnapshot.docs.map(item => ({id: item.id, ...item.data()} as AuditRecord));
      if (Ss.authService.isSuperAdmin()) {
        const globalSnapshot = await getDocs(query(collection(this.db, 'global_audit_logs'), orderBy('occurred_at', 'desc'), limit(50)));
        events.push(...globalSnapshot.docs.map(item => ({id: item.id, ...item.data()} as AuditRecord)));
      }
      events.sort((left, right) => (right.occurred_at?.toMillis?.() ?? 0) - (left.occurred_at?.toMillis?.() ?? 0));
      const visibleEvents = events.filter(event => event.resource_type !== 'push_tokens' && !event.resource_path.split('/').includes('push_tokens')).slice(0, 50);
      this.audit.set(visibleEvents);
      void this.loadActorNames(cityId, visibleEvents);
      this.currentPage.set(1);
    } catch (error) {
      console.error('No se pudo cargar la auditoría:', JSON.stringify(error));
      Ss.toastService.error({title: 'Acceso restringido', message: 'Tu rol no tiene permiso para consultar la auditoría de esta ciudad.'});
    } finally {
      this.loading.set(false);
    }
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.currentPage.set(1);
  }

  previousPage(): void {
    this.currentPage.update(page => Math.max(1, page - 1));
  }

  nextPage(): void {
    this.currentPage.update(page => Math.min(this.pageCount, page + 1));
  }

  formatTime(value: any): string {
    const date = value?.toDate?.() ?? (value instanceof Date ? value : null);
    return date ? date.toLocaleString('es-DO') : '';
  }

  toggleDetails(eventId: string): void {
    this.expandedEvents.update(current => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  actionLabel(action: string): string {
    return ({create: 'Creó', update: 'Actualizó', delete: 'Eliminó'} as Record<string, string>)[action] ?? action;
  }

  resourceLabel(event: AuditRecord): string {
    const type = event.resource_type || event.resource_path.split('/').filter(Boolean).at(-2) || 'registro';
    return RESOURCE_LABELS[type] ?? type.replace(/_/g, ' ');
  }

  resourceSummary(event: AuditRecord): string {
    const preferred = ['name', 'label', 'display_name', 'number', 'title', 'email'];
    for (const field of preferred) {
      const change = event.changes?.[field];
      if (!change || typeof change !== 'object' || !('before' in change || 'after' in change)) continue;
      const values = change as AuditChange;
      const value = event.action === 'delete' ? values.before : values.after;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return event.resource_type === 'roles' ? event.resource_id || '' : '';
  }

  fieldLabel(field: string): string {
    if (field.includes('.')) return field.split('.').map(part => this.fieldLabel(part)).join(' · ');
    return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, character => character.toLocaleUpperCase());
  }

  changeEntries(event: AuditRecord): Array<{field: string; before: unknown; after: unknown}> {
    return Object.entries(event.changes ?? {}).flatMap(([field, change]) => {
      if (change && typeof change === 'object' && ('before' in change || 'after' in change)) {
        const values = change as AuditChange;
        return this.flattenChanges(field, values.before, values.after);
      }
      return this.flattenChanges(field, null, change);
    });
  }

  private flattenChanges(field: string, before: unknown, after: unknown): Array<{field: string; before: unknown; after: unknown}> {
    if (field.split('.').some(part => ['updated_at', 'updatedat'].includes(part.toLocaleLowerCase()))) return [];
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    const beforeObject = this.isPlainObject(before) ? before : null;
    const afterObject = this.isPlainObject(after) ? after : null;
    if (beforeObject || afterObject) {
      const keys = new Set([...Object.keys(beforeObject ?? {}), ...Object.keys(afterObject ?? {})]);
      return [...keys].flatMap(key => this.flattenChanges(`${field}.${key}`, beforeObject?.[key] ?? null, afterObject?.[key] ?? null));
    }
    return [{field, before, after}];
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && typeof (value as {toDate?: unknown}).toDate !== 'function'
      && typeof (value as {path?: unknown}).path !== 'string';
  }

  formatValue(value: unknown, field = ''): string {
    if (/(password|secret|token|credential|api_?key)/i.test(field)) return 'Oculto por seguridad';
    if (value == null || value === '') return 'Sin valor';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'number') return value.toLocaleString('es-DO');
    if (Array.isArray(value)) return value.length ? `${value.length} elementos` : 'Ninguno';
    if (typeof value === 'object') {
      const item = value as {toDate?: () => Date; path?: string};
      if (typeof item.toDate === 'function') return item.toDate().toLocaleString('es-DO');
      if (typeof item.path === 'string') return item.path.split('/').filter(Boolean).at(-1) || 'Registro relacionado';
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.length) return 'Sin datos';
      if (entries.length <= 3 && entries.every(([, nested]) => nested == null || ['string', 'number', 'boolean'].includes(typeof nested))) {
        return entries.map(([key, nested]) => `${this.fieldLabel(key)}: ${this.formatValue(nested, key)}`).join(' · ');
      }
      return `${entries.length} campos`;
    }
    const text = String(value);
    return text.length > 180 ? `${text.slice(0, 177)}…` : text;
  }

  actorLabel(event: AuditRecord): string {
    return event.actor_uid ? this.actorNames()[event.actor_uid] || 'Usuario sin nombre' : 'Sistema';
  }

  private async loadActorNames(cityId: string, events: AuditRecord[]): Promise<void> {
    const auditEvents = events.filter(event => typeof event.actor_uid === 'string' && event.actor_uid)
      .map(event => ({id: event.id, actorUid: event.actor_uid}));
    try {
      const resolveNames = httpsCallable<{cityId: string; auditEvents: Array<{id: string; actorUid: string}>}, {names: Record<string, string>}>(this.functions, 'getAuditActorNames');
      const names = (await resolveNames({cityId, auditEvents})).data.names;
      if (this.cityId() === cityId) this.actorNames.set(names);
    } catch (error) {
      console.warn('No se pudieron resolver los nombres de auditoría:', JSON.stringify(error));
      if (this.cityId() === cityId) this.actorNames.set({});
    }
  }
}
