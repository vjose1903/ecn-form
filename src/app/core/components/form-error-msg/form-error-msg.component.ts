import { Component, Input, OnDestroy, OnInit, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Subject, fromEvent, merge } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

import { InputMask } from 'primeng/inputmask';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { DatePicker } from 'primeng/datepicker';
import { MultiSelect } from 'primeng/multiselect';
import { fun } from '@core/services/functions.service';
import { Ss } from '@core/services/singleton.service';

type PrimeNGComponent = InputMask | InputNumber | Select | DatePicker | MultiSelect;
type FieldElement = ElementRef<HTMLInputElement> | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | PrimeNGComponent;

@Component({
  selector: 'form-error-msg',
  imports: [],
  template: `
    @if (showError) {
    <div class="error-message">{{ errorMessage }}</div>
    }
  `,
  styles: [
    `
      .error-message {
        color: #e74c3c;
        font-size: 12px;
        margin-top: 0.05rem;
        position: absolute;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormErrorMsgComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() control?: AbstractControl | null;
  @Input() fieldName?: string; // Para mensajes personalizados
  @Input() fieldElement?: FieldElement;

  private readonly destroy$ = new Subject<void>();
  private mutationObserver?: MutationObserver;
  errorMessage: string = '';
  showError: boolean = false;

  private readonly ERROR_MESSAGES: Record<string, string | ((error: any) => string)> = {
    required: 'Este campo es requerido.',
    minlength: (error: any) => `Cant. mínima de letras es: ${error.requiredLength}.`,
    max: (error: any) => `Valor maximo requerido es: ${error.max} - actualmente tiene: ${error.actual}.`,
    min: (error: any) => `Valor mínimo requerido es: ${error.min} - actualmente tiene: ${error.actual}.`,
    ip: 'Intoduzca una ip valida.',
    compares: 'Las contraseñas no coinciden.',
    invalidCedula: 'Ingrese una cédula válida.',
    email: 'Ingrese una email válido.',
    sinRayas: () => `Complete el campo: ${this.fieldName || 'este campo'}`,
    pattern: 'Formato inválido.',
    maxlength: (error: any) => `Máximo ${error.requiredLength} caracteres.`,
  };

  constructor(private elementRef: ElementRef, private cdRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (!this.control) return;

    // Configurar listeners de cambios del control
    this.setupControlListeners();

    // Verificación inicial
    this.checkErrors();
  }

  ngAfterViewInit(): void {
    // Buscar el elemento de input relacionado después de que la vista se haya inicializado
    this.findAndSetupInputElement();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.mutationObserver?.disconnect();
  }

  private findAndSetupInputElement(): void {
    // Buscar el elemento de input en el DOM que esté relacionado con este control
    const parentElement = this.elementRef.nativeElement.parentElement;
    if (!parentElement) return;

    // Buscar elementos de input cercanos
    const inputElement = this.findInputElement(parentElement);
    if (inputElement) {
      this.setupInputEvents(inputElement);
    }
  }

  private findInputElement(parentElement: HTMLElement): HTMLElement | null {
    // Buscar elementos de input en el contenedor padre
    const selectors = ['input', 'textarea', 'select', '.p-inputtext', '.p-select-label', '[role="combobox"]', '.p-multiselect', '.p-multiselect-label'];

    for (const selector of selectors) {
      const element = parentElement.querySelector(selector) as HTMLElement;
      if (element) {
        return element;
      }
    }

    // Si no se encuentra, buscar en elementos hermanos
    const sibling = parentElement.previousElementSibling as HTMLElement;
    if (sibling) {
      for (const selector of selectors) {
        const element = sibling.querySelector(selector) as HTMLElement;
        if (element) {
          return element;
        }
      }
    }

    return null;
  }

  private setupInputEvents(element: HTMLElement): void {
    // Ejecutar fuera de la zona para mejor rendimiento
    Ss.ngZone.runOutsideAngular(() => {
      const events$ = [];

      // Eventos básicos para todos los elementos
      events$.push(fromEvent(element, 'blur').pipe(takeUntil(this.destroy$)));
      events$.push(fromEvent(element, 'focusout').pipe(takeUntil(this.destroy$)));

      // Eventos específicos según el tipo de elemento
      if (this.isInputElement(element)) {
        events$.push(fromEvent(element, 'input').pipe(takeUntil(this.destroy$)));
        events$.push(fromEvent(element, 'change').pipe(takeUntil(this.destroy$)));
      }

      if (this.isSelectLikeElement(element)) {
        events$.push(fromEvent(element, 'change').pipe(takeUntil(this.destroy$)));
        events$.push(fromEvent(element, 'click').pipe(takeUntil(this.destroy$)));

        // Eventos específicos para MultiSelect
        if (this.isMultiSelectElement(element)) {
          this.setupMultiSelectEvents(element, events$);
        }
      }

      // Combinar todos los eventos con debounce
      merge(...events$)
        .pipe(debounceTime(10), takeUntil(this.destroy$))
        .subscribe(event => {
          // Ejecutar dentro de la zona para trigger change detection
          Ss.ngZone.run(() => {
            if (this.control) {
              this.control.markAsTouched();
              this.checkErrors();
            }
          });
        });
    });
  }

  private setupControlListeners(): void {
    if (!this.control) return;

    // Combinar valueChanges y statusChanges con debounce para evitar múltiples verificaciones
    merge(this.control.valueChanges, this.control.statusChanges)
      .pipe(debounceTime(10), takeUntil(this.destroy$))
      .subscribe(() => {
        this.checkErrors();
      });
  }

  private isInputElement(element: HTMLElement): boolean {
    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
  }

  private isSelectLikeElement(element: HTMLElement): boolean {
    return element.tagName === 'SELECT' || element.getAttribute('role') === 'combobox' || element.classList.contains('p-multiselect') || element.classList.contains('p-multiselect-label') || element.classList.contains('p-select');
  }

  private isMultiSelectElement(element: HTMLElement): boolean {
    return element.classList.contains('p-multiselect') || element.classList.contains('p-multiselect-label');
  }

  private setupMultiSelectEvents(element: HTMLElement, events$: any[]): void {
    // Eventos de teclado
    events$.push(fromEvent(element, 'keydown').pipe(takeUntil(this.destroy$)));

    // Observer para cambios en aria-expanded (apertura/cierre del dropdown)
    this.setupAriaExpandedObserver(element);
  }

  private setupAriaExpandedObserver(element: HTMLElement): void {
    this.mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'aria-expanded') {
          const target = mutation.target as HTMLElement;
          const isExpanded = target.getAttribute('aria-expanded') === 'true';

          if (!isExpanded) {
            Ss.ngZone.run(() => {
              if (this.control) {
                this.control.markAsTouched();
                fun.setTimeout(() => this.checkErrors(), 10);
              }
            });
          }
        }
      });
    });

    this.mutationObserver.observe(element, { attributes: true, attributeFilter: ['aria-expanded'] });
  }

  private checkErrors(): void {
    if (!this.control) return;

    const wasShowingError = this.showError;
    const previousMessage = this.errorMessage;

    this.showError = this.control.invalid && (this.control.dirty || this.control.touched);

    if (this.showError && this.control.errors) {
      const firstErrorKey = Object.keys(this.control.errors)[0];
      const errorValue = this.control.errors[firstErrorKey];
      const errorMessageFn = this.ERROR_MESSAGES[firstErrorKey];

      this.errorMessage = typeof errorMessageFn === 'function' ? errorMessageFn(errorValue) : errorMessageFn || `Error en el campo: ${firstErrorKey}`;
    } else {
      this.errorMessage = '';
    }

    // Solo disparar change detection si algo cambió
    if (wasShowingError !== this.showError || previousMessage !== this.errorMessage) {
      this.cdRef.detectChanges();
    }
  }
}
