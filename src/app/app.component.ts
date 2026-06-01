import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { ModalService, ModalType } from './services/modal.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { BookingService } from './services/booking.service';
import { SettingsService } from './services/settings.service';
import { AppStateService } from './services/app-state.service';
import { SliderService } from './services/slider.service';
import { CarService } from './services/car.service';
import { forkJoin } from 'rxjs';

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
  
  // Loading state variables
  isLoading = true;

  constructor(
    private modalService: ModalService,
    private router: Router,
    private toastr: ToastrService,
    private bookingService: BookingService,
    private settingsService: SettingsService,
    private appStateService: AppStateService,
    private sliderService: SliderService,
    private carService: CarService
  ) {}

  ngOnInit() {
    console.log('🟢 Starting application - isLoading = true');
    
    // Force show loader
    this.isLoading = true;
    this.appStateService.setLoading(true);

    // Subscribe to loading state from service
    this.appStateService.isLoading$.subscribe(state => {
      console.log('🔄 isLoading state changed to:', state);
      this.isLoading = state;
    });

    this.modalSubscription = this.modalService.getCurrentModal().subscribe(
      modal => {
        this.currentModal = modal;
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
      }
    });

    // Load initial page data
    this.loadInitialData();

    // Check for payment callback parameters on navigation
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.checkPaymentCallback();
      });

    this.checkPaymentCallback();
    this.checkPendingBooking();
  }

  /**
   * Load all initial data for the homepage - waits for ALL data to complete
   */
  loadInitialData() {
    // Check if we are on the homepage
    const isHomePage = this.router.url === '/' || this.router.url === '/home';
    
    if (isHomePage) {
      console.log('🏠 Homepage detected - loading data (loader will stay until ALL data is loaded)');
      
      // Fetch all required data for the homepage
      forkJoin({
        sliders: this.sliderService.getSliders(),
        economicDaily: this.carService.getCarsByCategoryAndPeriod(1, 'daily'),
        economicMonthly: this.carService.getCarsByCategoryAndPeriod(1, 'monthly'),
        suvDaily: this.carService.getCarsByCategoryAndPeriod(6, 'daily'),
        suvMonthly: this.carService.getCarsByCategoryAndPeriod(6, 'monthly')
      })
      .subscribe({
        next: (result) => {
          console.log('📦 All data loaded successfully');
          console.log('Sliders:', result.sliders.length);
          console.log('Economic Daily Cars:', result.economicDaily.length);
          console.log('Economic Monthly Cars:', result.economicMonthly.length);
          console.log('SUV Daily Cars:', result.suvDaily.length);
          console.log('SUV Monthly Cars:', result.suvMonthly.length);
          
          // Store data in sessionStorage for components to access
          sessionStorage.setItem('carsData', JSON.stringify({
            dailyEconomicCars: result.economicDaily,
            dailySuvCars: result.suvDaily,
            monthlyEconomicCars: result.economicMonthly,
            monthlySuvCars: result.suvMonthly
          }));
          
          // Hide loader ONLY after all data is loaded
          console.log('✅ All data complete - hiding loader now');
          this.isLoading = false;
          this.appStateService.hideLoader();
        },
        error: (error) => {
          console.error('❌ Error loading data:', error);
          // Even if there's an error, hide loader after 1 second
          setTimeout(() => {
            console.log('⚠️ Hiding loader due to error');
            this.isLoading = false;
            this.appStateService.hideLoader();
          }, 1000);
        }
      });
    } else {
      // If not homepage, hide loader immediately
      console.log('🚫 Not homepage - hiding loader immediately');
      setTimeout(() => {
        this.isLoading = false;
        this.appStateService.hideLoader();
      }, 100);
    }
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

    if (paymentId) {
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
      this.handlePaymentCallback(true);
    } else if (success === 'false' || status === 'failed' || paymentStatus === 'failed') {
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
        this.createBookingAfterPayment();
      } else {
        sessionStorage.removeItem('pending_booking');
        this.toastr.error('فشل الدفع. يرجى المحاولة مرة أخرى', 'خطأ');
      }
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
      try {
        const bookingData = JSON.parse(pendingBooking);
        const bookingTime = bookingData.timestamp || 0;
        const now = Date.now();
        const thirtyMinutes = 30 * 60 * 1000;
        
        if (now - bookingTime > thirtyMinutes) {
          sessionStorage.removeItem('pending_booking');
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
          sessionStorage.removeItem('pending_booking');
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

  onLogoError(event: Event) {
    const img = event.target as HTMLImageElement;
    console.error('Logo failed to load. Attempted path:', img.src);
    img.src = '/assets/images/nav-logo.png';
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