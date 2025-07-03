import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatHomeDataList } from './retreat-home-data-list';

describe('RetreatHomeDataList', () => {
  let component: RetreatHomeDataList;
  let fixture: ComponentFixture<RetreatHomeDataList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatHomeDataList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatHomeDataList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
