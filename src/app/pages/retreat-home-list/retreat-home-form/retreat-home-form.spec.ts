import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatHomeForm } from './retreat-home-form';

describe('RetreatHomeForm', () => {
  let component: RetreatHomeForm;
  let fixture: ComponentFixture<RetreatHomeForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatHomeForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatHomeForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
