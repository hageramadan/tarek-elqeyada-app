import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookingReviewComponent } from './booking-review.component';

describe('BookingReviewComponent', () => {
  let component: BookingReviewComponent;
  let fixture: ComponentFixture<BookingReviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingReviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookingReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
