import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetreatHomeView } from './retreat-home-view';

describe('RetreatHomeView', () => {
  let component: RetreatHomeView;
  let fixture: ComponentFixture<RetreatHomeView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RetreatHomeView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RetreatHomeView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
