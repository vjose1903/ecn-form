import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatHomeList } from './retreat-home-list';

describe('RetreatHomeList', () => {
  let component: RetreatHomeList;
  let fixture: ComponentFixture<RetreatHomeList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatHomeList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatHomeList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
