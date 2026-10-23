import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs, limit, orderBy, query } from '@angular/fire/firestore';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Ss } from '@core/services/singleton.service';

interface Choice {label: string; value: string}
interface AuditRecord {id: string; actor_uid: string; action: string; resource_path: string; occurred_at: any; changes: Record<string, unknown>}

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
  readonly cities = signal<Choice[]>([]);
  readonly cityId = signal('');
  readonly audit = signal<AuditRecord[]>([]);
  readonly loading = signal(false);
  readonly searchTerm = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly pageSizeOptions = [10, 20, 50].map(value => ({label: String(value), value}));

  get filteredAudit(): AuditRecord[] {
    const search = this.searchTerm().trim().toLocaleLowerCase();
    return this.audit().filter(event => !search || `${event.actor_uid} ${event.action} ${event.resource_path} ${JSON.stringify(event.changes ?? {})}`.toLocaleLowerCase().includes(search));
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
      this.audit.set(events.slice(0, 50));
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
}
