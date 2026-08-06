import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NgxAuthClient } from './ngx-auth-client';

describe('NgxAuthClient', () => {
  let component: NgxAuthClient;
  let fixture: ComponentFixture<NgxAuthClient>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgxAuthClient],
    }).compileComponents();

    fixture = TestBed.createComponent(NgxAuthClient);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
