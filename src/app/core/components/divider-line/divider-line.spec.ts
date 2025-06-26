import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DividerLine } from './divider-line';

describe('DividerLine', () => {
  let component: DividerLine;
  let fixture: ComponentFixture<DividerLine>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DividerLine]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DividerLine);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
