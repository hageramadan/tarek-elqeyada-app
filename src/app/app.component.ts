import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { ModalService, ModalType } from './services/modal.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { BookingService } from './services/booking.service';
import { SettingsService } from './services/settings.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  currentModal: ModalType = null;
  previousModal: ModalType = null;
  whatsappUrl: string = 'https://wa.me/966920051022';
  private modalSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    private modalService: ModalService,
    private router: Router,
    private toastr: ToastrService,
    private bookingService: BookingService,
    private settingsService: SettingsService
  ) {}

  ngOnInit() {
    this.modalSubscription = this.modalService.getCurrentModal().subscribe(
      modal => {
        this.currentModal = modal;
        // Update previous modal when current modal changes
        this.previousModal = this.modalService.getPreviousModal();
      }
    );

    // Load WhatsApp URL from settings
    this.settingsService.getSettings().subscribe({
      next: (settings) => {
        if (settings.phone) {
          this.whatsappUrl = this.settingsService.getWhatsAppUrl(settings.phone);
        }
      },
      error: (error) => {
        console.error('Error loading settings for WhatsApp:', error);
        // Keep default WhatsApp URL
      }
    });

    // Check for payment callback parameters on navigation
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.checkPaymentCallback();
      });

    // Check on initial load
    this.checkPaymentCallback();

    // Check for pending booking on app load (in case user closed browser and came back)
    this.checkPendingBooking();
  }

  /**
   * Check for payment callback parameters in URL
   */
  checkPaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const status = urlParams.get('status');
    const paymentStatus = urlParams.get('payment_status');
    const paymentId = urlParams.get('payment_id');

    // Store payment_id if present in URL
    if (paymentId) {
      
      // Store in sessionStorage for later use
      const pendingBooking = sessionStorage.getItem('pending_booking');
      if (pendingBooking) {
        try {
          const bookingData = JSON.parse(pendingBooking);
          bookingData.paymentId = paymentId;
          sessionStorage.setItem('pending_booking', JSON.stringify(bookingData));
        } catch (e) {
          console.error('Error storing payment_id:', e);
        }
      }
    }

    if (success === 'true' || status === 'success' || paymentStatus === 'success') {
      // Payment was successful, check for pending booking
      this.handlePaymentCallback(true);
    } else if (success === 'false' || status === 'failed' || paymentStatus === 'failed') {
      // Payment failed
      this.handlePaymentCallback(false);
    }
  }

  /**
   * Handle payment callback from PayMob
   */
  handlePaymentCallback(success: boolean) {
    const pendingBooking = sessionStorage.getItem('pending_booking');
    if (pendingBooking) {
      if (success) {
        // Create booking after successful payment
        this.createBookingAfterPayment();
      } else {
        // Payment failed, clear pending booking
        sessionStorage.removeItem('pending_booking');
        this.toastr.error('فشل الدفع. يرجى المحاولة مرة أخرى', 'خطأ');
      }
      // Clear URL parameters
      this.router.navigate([this.router.url.split('?')[0]], {
        queryParams: {},
        replaceUrl: true
      });
    }
  }

  /**
   * Check for pending booking on app initialization
   */
  checkPendingBooking() {
    const pendingBooking = sessionStorage.getItem('pending_booking');
    if (pendingBooking) {
      // Check if booking was created more than 30 minutes ago (expired)
      try {
        const bookingData = JSON.parse(pendingBooking);
        const bookingTime = bookingData.timestamp || 0;
        const now = Date.now();
        const thirtyMinutes = 30 * 60 * 1000;
        
        if (now - bookingTime > thirtyMinutes) {
          // Booking expired, clear it
          sessionStorage.removeItem('pending_booking');
         
        } else {
          // Booking still valid, user might want to retry
          
        }
      } catch (e) {
        console.error('Error checking pending booking:', e);
        sessionStorage.removeItem('pending_booking');
      }
    }
  }

  /**
   * Create booking after successful payment
   */
  createBookingAfterPayment() {
    const storedBookingData = sessionStorage.getItem('pending_booking');
    if (!storedBookingData) {
      console.error('No pending booking data found');
      return;
    }

    let bookingData: any;
    try {
      bookingData = JSON.parse(storedBookingData);
    } catch (e) {
      console.error('Error parsing booking data:', e);
      sessionStorage.removeItem('pending_booking');
      return;
    }

    const bookingRequest = bookingData.bookingRequest;
    

    this.bookingService.createBooking(bookingRequest).subscribe({
      next: (response) => {
       
        if (response.result) {
        
          // Clear pending booking from session
          sessionStorage.removeItem('pending_booking');
          
          // Show confirmation
          this.modalService.openModal('booking-confirmation');
        } else {
          
          this.toastr.error(response.message || 'حدث خطأ أثناء إنشاء الحجز', 'خطأ');
        }
      },
      error: (error) => {
        console.error('Booking Error:', error);
        const errorMessage = error.error?.message || error.message || 'حدث خطأ أثناء إنشاء الحجز';
        this.toastr.error(errorMessage, 'خطأ');
      }
    });
  }

  ngOnDestroy() {
    if (this.modalSubscription) {
      this.modalSubscription.unsubscribe();
    }
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }
}
