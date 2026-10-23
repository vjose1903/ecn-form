import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CityClass } from '@core/entities/city/city.class';
import { CityService } from '@core/entities/city/city.service';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'app-cities-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule],
  templateUrl: './cities-management.html',
  styleUrl: './cities-management.scss',
})
export class CitiesManagement implements OnInit {
  private readonly cityService = inject(CityService);
  private readonly functions = inject(Functions);
  readonly cities = this.cityService.cities;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly dialogVisible = signal(false);
  readonly error = signal('');
  readonly searchTerm = signal('');
  readonly editingCity = signal<CityClass | null>(null);
  readonly filteredCities = computed(() => {
    const search = this.searchTerm().trim().toLocaleLowerCase();
    return this.cities()
      .filter(city => !search || `${city.label} ${city.large_label} ${city.id}`.toLocaleLowerCase().includes(search))
      .sort((left, right) => left.label.localeCompare(right.label, 'es'));
  });
  readonly cityIdPreview = computed(() => this.editingCity()?.id || this.slug(this.label));
  label = '';
  largeLabel = '';
  definiteArticle = '';

  ngOnInit(): void {
    void this.loadCities();
  }

  async loadCities(): Promise<void> {
    this.loading.set(true);
    try {
      await this.cityService.loadAllCities();
    } catch (error) {
      console.error('No se pudieron cargar las ciudades:', JSON.stringify(error));
      Ss.toastService.error({title: 'Error de carga', message: 'No se pudieron cargar las ciudades.'});
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingCity.set(null);
    this.label = '';
    this.largeLabel = '';
    this.definiteArticle = '';
    this.error.set('');
    this.dialogVisible.set(true);
  }

  openEdit(city: CityClass): void {
    this.editingCity.set(city);
    this.label = city.label;
    this.largeLabel = city.large_label;
    this.definiteArticle = city.definite_article;
    this.error.set('');
    this.dialogVisible.set(true);
  }

  async saveCity(): Promise<void> {
    const label = this.label.trim();
    if (!label) {
      this.error.set('Escribe el nombre de la ciudad.');
      return;
    }
    if (!this.cityIdPreview()) {
      this.error.set('El nombre debe generar un identificador válido.');
      return;
    }

    this.error.set('');
    this.saving.set(true);
    try {
      const save = httpsCallable(this.functions, 'saveCity');
      const result = await save({
        cityId: this.editingCity()?.id ?? null,
        label,
        largeLabel: this.largeLabel.trim() || label,
        definiteArticle: this.definiteArticle.trim(),
      });
      await this.cityService.loadAllCities();
      this.dialogVisible.set(false);
      const created = (result.data as {created?: boolean}).created === true;
      Ss.toastService.success({
        title: created ? 'Ciudad creada' : 'Ciudad actualizada',
        message: created ? 'Se añadieron también los roles predeterminados.' : 'Los datos quedaron actualizados.',
      });
    } catch (error) {
      console.error('No se pudo guardar la ciudad:', JSON.stringify(error));
      this.error.set('No se pudo guardar. Verifica que el nombre no esté repetido e inténtalo de nuevo.');
      Ss.toastService.error({title: 'No se pudo guardar', message: 'Verifica los datos de la ciudad e inténtalo de nuevo.'});
    } finally {
      this.saving.set(false);
    }
  }

  private slug(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }
}
