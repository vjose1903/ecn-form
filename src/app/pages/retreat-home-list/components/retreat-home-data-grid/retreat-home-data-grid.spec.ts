import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatHomeDataGrid } from './retreat-home-data-grid';

describe('RetreatHomeDataGrid', () => {
  let component: RetreatHomeDataGrid;
  let fixture: ComponentFixture<RetreatHomeDataGrid>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatHomeDataGrid]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatHomeDataGrid);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
