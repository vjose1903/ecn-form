import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatList } from './retreat-list';

describe('RetreatList', () => {
  let component: RetreatList;
  let fixture: ComponentFixture<RetreatList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
