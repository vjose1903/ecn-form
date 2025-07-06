import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RequestSend } from './request-send';

describe('RequestSend', () => {
  let component: RequestSend;
  let fixture: ComponentFixture<RequestSend>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestSend]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RequestSend);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
