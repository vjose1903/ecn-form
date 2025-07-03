import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatDataGrid } from './retreat-data-grid';

describe('RetreatDataGrid', () => {
  let component: RetreatDataGrid;
  let fixture: ComponentFixture<RetreatDataGrid>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatDataGrid]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatDataGrid);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
