import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatDataList } from './retreat-data-list';

describe('RetreatDataList', () => {
  let component: RetreatDataList;
  let fixture: ComponentFixture<RetreatDataList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatDataList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatDataList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
