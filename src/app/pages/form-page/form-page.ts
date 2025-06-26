import { Component, inject } from '@angular/core';
import { Layout } from '../../layout/layout';
import { AccordionModule } from 'primeng/accordion';
import { InputTextModule } from 'primeng/inputtext';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { InputMaskModule } from 'primeng/inputmask';

import { SelectButtonModule } from 'primeng/selectbutton';
import { DividerLine } from '../../core/components/divider-line/divider-line';
import { DeviceDetectorService } from '../../core/services/device-detector.service';
import { DeviceE } from '../../core/models/device-detector.model';

@Component({
  selector: 'app-form-page',
  imports: [AccordionModule, InputTextModule, FormsModule, SelectModule, DatePickerModule, TextareaModule, InputMaskModule, SelectButtonModule, DividerLine],
  templateUrl: './form-page.html',
  styleUrl: './form-page.scss',
})
export class FormPage {
  deviceDetectorService = inject(DeviceDetectorService);

  get isDesktop() {
    return this.deviceDetectorService.getDeviceInfo().device === DeviceE.desktop;
  }

  openedAccordionPanel: number[] = [0, 1, 2];

  dates = [{ label: '31 de Octubre al 02 de Noviembre 2025' }];

  timeRanges = [{ label: '0 a 6 meses' }, { label: '6 a 12 meses' }, { label: '1 a 4 años' }, { label: '4 a 6 años' }, { label: '6 a 8 años' }, { label: '8 a 10 años' }, { label: 'mas de 10 años' }];

  howToKnow = [{ label: 'Redes' }, { label: 'Amigos' }, { label: 'Familia' }, { label: 'Otro' }];

  identityTypes = [{ label: 'Cédula' }, { label: 'Pasaporte' }];

  yesNoOptions = [{ label: 'Si' }, { label: 'No' }];

  companionOptions = [{ label: 'Padre' }, { label: 'Madre' }, { label: 'Hermano' }, { label: 'Hermana' }, { label: 'Tio' }, { label: 'Tia' }, { label: 'Abuelo' }, { label: 'Abuela' }, { label: 'Amigo' }];

  selectedHowToKnow: string = '';
  selectedIdentityType: string = '';
  selectedYesNo: string = '';
  liveWithCompanion: string = '';
  weddingDate: string = '';
  selectedCompanion: string = '';

  changeAccordionPanelIndex(index: number, type: 'close' | 'open') {
    console.log('event ', index);
    console.log('type ', type);

    if (type === 'close') {
      this.openedAccordionPanel = this.openedAccordionPanel.filter(panel => panel !== index);
    } else {
      this.openedAccordionPanel.push(index);
    }

    this.openedAccordionPanel.sort((a, b) => a - b);

    console.log('openedAccordionPanel ', this.openedAccordionPanel);
  }
}
