import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoupleView } from './couple-view';

describe('CoupleView', () => {
  let component: CoupleView;
  let fixture: ComponentFixture<CoupleView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoupleView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CoupleView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
