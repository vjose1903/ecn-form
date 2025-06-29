import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatForm } from './retreat-form';

describe('RetreatForm', () => {
  let component: RetreatForm;
  let fixture: ComponentFixture<RetreatForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
