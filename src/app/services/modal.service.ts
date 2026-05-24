import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Car } from './car.service';

export type ModalType = 'login' | 'register' | 'otp' | 'booking' | 'booking-confirmation' | null;
export type BookingRentalPeriod = 'daily' | 'monthly';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private currentModal$ = new BehaviorSubject<ModalType>(null);
  private previousModal$ = new BehaviorSubject<ModalType>(null);
  private otpPhone$ = new BehaviorSubject<string>('');
  private otpCountryCode$ = new BehaviorSubject<string>('+966');
  private otpPhoneNumber$ = new BehaviorSubject<string>('');
  private selectedCar$ = new BehaviorSubject<Car | null>(null);
  private bookingRentalPeriod$ = new BehaviorSubject<BookingRentalPeriod>('daily');
  private otpVerifiedCallback: (() => void) | null = null;

  getCurrentModal(): Observable<ModalType> {
    return this.currentModal$.asObservable();
  }

  getPreviousModal(): ModalType {
    return this.previousModal$.value;
  }

  hasPreviousModal(): boolean {
    return this.previousModal$.value !== null;
  }

  openModal(modalType: ModalType) {
    // If opening OTP modal and there's a booking modal, save it as previous
    if (modalType === 'otp' && this.currentModal$.value === 'booking') {
      this.previousModal$.next(this.currentModal$.value);
    }
    this.currentModal$.next(modalType);
  }

  closeModal() {
    // If closing OTP modal and there's a previous modal (booking), restore it
    if (this.currentModal$.value === 'otp' && this.previousModal$.value) {
      const previous = this.previousModal$.value;
      this.previousModal$.next(null);
      this.currentModal$.next(previous);
    } else {
      this.currentModal$.next(null);
      this.previousModal$.next(null);
    }
  }

  setOTPPhone(phone: string) {
    this.otpPhone$.next(phone);
  }

  getOTPPhone(): string {
    return this.otpPhone$.value;
  }

  setOTPData(country_code: string, phone: string) {
    this.otpCountryCode$.next(country_code);
    this.otpPhoneNumber$.next(phone);
    // Keep full phone for display
    this.otpPhone$.next(country_code + phone);
  }

  getOTPCountryCode(): string {
    return this.otpCountryCode$.value;
  }

  getOTPPhoneNumber(): string {
    return this.otpPhoneNumber$.value;
  }

  setSelectedCar(car: Car) {
    this.selectedCar$.next(car);
  }

  getSelectedCar(): Car | null {
    return this.selectedCar$.value;
  }

  setBookingRentalPeriod(period: BookingRentalPeriod) {
    this.bookingRentalPeriod$.next(period);
  }

  getBookingRentalPeriod(): BookingRentalPeriod {
    return this.bookingRentalPeriod$.value;
  }

  setOTPVerifiedCallback(callback: () => void) {
    this.otpVerifiedCallback = callback;
  }

  executeOTPVerifiedCallback() {
    if (this.otpVerifiedCallback) {
      this.otpVerifiedCallback();
      this.otpVerifiedCallback = null; // Clear callback after execution
    }
  }
}
