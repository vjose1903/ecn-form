import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {Ss} from '@core/services/singleton.service';

export function protectDialogChanges(ref: DynamicDialogRef, hasChanges: () => boolean, isSaving: () => boolean): () => void {
  const originalClose = ref.close.bind(ref);
  const dialog = Ss.dialogService?.getInstance(ref)?.dialog;
  const dialogClose = dialog?.close;
  let confirming = false;
  let approved = false;
  const requestClose = () => {
    if (isSaving() || confirming) return;
    if (approved || !hasChanges()) {
      originalClose();
      return;
    }
    confirming = true;
    Ss.confirmationService.confirm({
      header: 'Cambios sin guardar',
      message: 'Has realizado cambios. Si sales del formulario, se perderán los cambios sin guardar.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Salir', rejectLabel: 'Seguir editando', defaultFocus: 'reject',
      acceptButtonStyleClass: 'p-button-danger', rejectButtonStyleClass: 'p-button-secondary',
      accept: () => { approved = true; confirming = false; originalClose(); },
      reject: () => { confirming = false; },
    });
  };
  ref.close = result => {
    if (result !== undefined || approved) originalClose(result);
    else requestClose();
  };
  // Intercept before PrimeNG hides the dialog, preserving the form when exit is rejected.
  if (dialog) dialog.close = requestClose;
  return () => {
    ref.close = originalClose;
    if (dialog && dialogClose) dialog.close = dialogClose;
  };
}
