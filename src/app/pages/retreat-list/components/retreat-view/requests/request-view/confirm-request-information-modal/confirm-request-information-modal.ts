import {protectDialogChanges} from '@core/typescript/protect-dialog-changes';
import {SelectModule} from 'primeng/select';
import {relationshipOptions} from '@core/typescript/relationship-options';
import {CommonModule} from '@angular/common';
import {AfterViewInit, Component, OnDestroy, inject, signal} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {InputMaskModule} from 'primeng/inputmask';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {AngularSvgIconModule} from 'angular-svg-icon';
import {RequestClass} from '@core/entities/request/request.class';
import {CoupleI, FamilyMemberI, RequestI} from '@core/entities/request/request.model';
import {RequestService} from '@core/entities/request/request.service';
import {RetreatClass} from '@core/entities/retreat/retreat.class';
import {Ss} from '@core/services/singleton.service';
import {PhoneValidator} from '@core/typescript/validators/validate-phone';

@Component({
  selector: 'app-confirm-request-information-modal',
  imports: [SelectModule, CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, InputMaskModule, AngularSvgIconModule],
  templateUrl: './confirm-request-information-modal.html',
  styleUrl: './confirm-request-information-modal.scss',
})
export class ConfirmRequestInformationModal implements AfterViewInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly config = inject(DynamicDialogConfig);
  readonly ref = inject(DynamicDialogRef);
  private readonly requestService = inject(RequestService);
  readonly request = this.config.data.request as RequestClass;
  readonly retreat = this.config.data.retreat as RetreatClass;
  readonly isConfirmed = this.request.isConfirmed;
  readonly loading = signal(false);
  readonly relationshipOptions = relationshipOptions;

  readonly canConfirmFamily = this.request.canReadDetailSection('family') && this.request.canEditDetailSection('family');

  private familyMemberForm(member?: FamilyMemberI) {
    return this.fb.nonNullable.group({
      familiar_full_name: [member?.familiar_full_name ?? '', [Validators.required, Validators.maxLength(180)]],
      familiar_relationship: [member?.familiar_relationship ?? '', [Validators.required, Validators.maxLength(100)]],
      familiar_phone: [member?.familiar_phone ?? '', [PhoneValidator.validate]],
    });
  }

  private personForm(person: CoupleI) {
    return this.fb.nonNullable.group({
      full_name: [person.full_name ?? '', [Validators.required, Validators.maxLength(180)]],
      cell_phone: [person.cell_phone ?? '', [Validators.required, PhoneValidator.validate]],
      family_information: this.fb.array((person.family_information ?? []).map(member => this.familyMemberForm(member))),
      emergency_full_name: [person.emergency_full_name ?? '', [Validators.maxLength(180)]],
      emergency_relationship: [person.emergency_relationship ?? '', [Validators.maxLength(100)]],
      emergency_phone: [person.emergency_phone ?? '', [PhoneValidator.validate]],
    });
  }

  readonly form = this.fb.group({she: this.personForm(this.request.she), he: this.personForm(this.request.he)});

  private readonly initialFormValue = JSON.stringify(this.form.getRawValue());
  private restoreClose?: () => void;

  ngAfterViewInit(): void {
    this.restoreClose = protectDialogChanges(this.ref,
      () => JSON.stringify(this.form.getRawValue()) !== this.initialFormValue,
      () => this.loading());
  }

  ngOnDestroy(): void { this.restoreClose?.(); }

  requestClose(): void { this.ref.close(); }

  constructor() {
    if (!this.canConfirmFamily) {
      for (const person of [this.form.controls.she, this.form.controls.he]) {
        for (const field of ['family_information', 'emergency_full_name', 'emergency_relationship', 'emergency_phone'] as const) person.controls[field].disable();
      }
    }
  }

  familyMembers(person: string) {
    return this.form.controls[person === 'she' ? 'she' : 'he'].controls.family_information;
  }

  private confirmedValues(person: 'she' | 'he') {
    const raw = this.form.controls[person].getRawValue();
    return {
      full_name: raw.full_name.trim(), cell_phone: raw.cell_phone.trim(),
      ...(this.canConfirmFamily ? {
        emergency_full_name: raw.emergency_full_name.trim(),
        emergency_relationship: raw.emergency_relationship.trim(),
        emergency_phone: raw.emergency_phone.trim(),
        family_information: raw.family_information.map(member => ({
          familiar_full_name: member.familiar_full_name.trim(),
          familiar_relationship: member.familiar_relationship.trim(),
          familiar_phone: member.familiar_phone.trim(),
        })),
      } : {}),
    };
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.loading() || this.form.invalid) return;
    this.loading.set(true);
    try {
      const updated = await this.requestService.confirmRequestInformation(this.request, this.retreat, {
        she: this.confirmedValues('she'),
        he: this.confirmedValues('he'),
      });
      Ss.toastService.success({title: 'Información confirmada', message: 'La información verificada quedó guardada.'});
      this.ref.close(updated);
    } catch (error) {
      console.error('Error al confirmar la información de la solicitud:', JSON.stringify(error instanceof Error ? {name: error.name, message: error.message, stack: error.stack} : error));
      Ss.toastService.error({title: 'No se pudo confirmar', message: error instanceof Error ? error.message : 'Intenta nuevamente.'});
    } finally {
      this.loading.set(false);
    }
  }
}
