import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom, catchError, of, switchMap } from 'rxjs';

import { ToastrService } from 'ngx-toastr';
import { User, AuthService } from '../../services/auth.service';
import { BookingService, BookingRequest } from '../../services/booking.service';
import { Car } from '../../services/car.service';
import { Country, CountriesService } from '../../services/countries.service';
import { ModalService } from '../../services/modal.service';
import { PaymentService, PaymentMethod, PaymentCheckoutRequest } from '../../services/payment.service';

@Component({
  selector: 'app-booking',
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit, OnDestroy {
  bookingForm: FormGroup;
  selectedCar: Car | null = null;
  isLoading = false;
  countries: Country[] = [];
  selectedCountry: Country | null = null;
  isCountryDropdownOpen = false;
  selectedDate: string = '';
  selectedTime: string = '';
  totalDays: number = 1;
  bookingType: 'daily' | 'monthly' = 'daily';
  showDatePicker = false;
  showTimePicker = false;
  showConditions = true;
  bookingTerms: any[] = [];
  private lockedScrollY = 0;
  private scrollLocked = false;
  deliveryType: 'to_location' | 'from_branch' = 'to_location';
  selectedPaymentMethod: number | null = null;
  licenseFile: File | null = null;
  licenseImageUrl: string | null = null;
  deliveryFee: number = 0; // رسوم التوصيل - من API
  taxAmount: number = 0; // الضريبة - من API
  user: User | null = null;
  
  // Price calculation data from API
  priceData: {
    base_price: number;
    additional_services_total: number;
    discount_amount: number;
    coupon_discount: number;
    tax_amount: number;
    total_amount: number;
    total_days: number;
    end_date: string;
    end_time: string;
    price_breakdown: {
      base_price: number;
      additional_services_total: number;
      delivery_fees: number;
      insurance_price: number;
      discount: number;
      coupon_discount: number;
      subtotal: number;
      tax: number;
      total: number;
    };
  } | null = null;
  isLoadingPrice = false;
  showMapModal = false;
  selectedLocation: { address: string; lat: number; lng: number } | null = null;
  mapSearchQuery = '';
  map: any = null;
  marker: any = null;
  centerMarker: any = null; // Fixed center marker
  geocoder: any = null;
  mapCenterListener: any = null; // Listener for map center changes

  // Available dates (next 7 days)
  availableDates: { label: string; value: string; date: Date }[] = [];

  // Available times
  availableTimes: string[] = [
    '9:00 ص', '9:30 ص', '10:00 ص', '10:30 ص', '11:00 ص',
    '12:00 م', '12:30 م', '1:00 م', '1:30 م', '2:00 م',
    '3:00 م', '3:30 م', '4:00 م', '4:30 م', '5:00 م'
  ];

  // Payment methods - loaded from API (default methods shown immediately)
  paymentMethods: PaymentMethod[] = [
    { id: 0, name: 'ابل باي', icon: 'apple-pay', index: 0, type: 'apple_pay' },
    { id: 1, name: 'فيزا / ماستر', icon: 'visa-mastercard', index: 1, type: 'card' },
    { id: 2, name: 'مدى', icon: 'mada', index: 1, type: 'card' },
    // { id: 3, name: 'تابي', icon: 'tabby', index: 2, type: 'tabby' },
    { id: 4, name: 'تماره', icon: 'tamara', index: 3, type: 'tamara' }
  ];
  isLoadingPaymentMethods = false;
  
  // Additional services
  selectedAdditionalServices: number[] = []; // Array of service IDs

  constructor(
    private fb: FormBuilder,
    private modalService: ModalService,
    private bookingService: BookingService,
    private countriesService: CountriesService,
    private toastr: ToastrService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private paymentService: PaymentService
  ) {
    this.bookingForm = this.fb.group({
      name: ['', [Validators.required]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{9,}$/)]],
      countryCode: ['+966'],
      email: ['', [Validators.email]],
      address: ['', [Validators.required]],
      zip: [''],
      city: ['الرياض', [Validators.required]]
    });
  }

  ngOnInit() {
    this.selectedCar = this.modalService.getSelectedCar();
    this.bookingType = this.modalService.getBookingRentalPeriod();
    
    // Lock background scroll when modal is open
    this.lockBodyScroll();

    // Reset selected additional services when component initializes
    this.selectedAdditionalServices = [];
    
    // Auto-select fixed delivery service (always selected)
    this.selectedAdditionalServices.push(-1); // Fixed delivery service ID

    // Keep the selected booking type for UI (daily/monthly).
    // We'll validate monthly availability on submit instead of silently falling back.
    this.countries = this.countriesService.getCountries();
    
    // Load user data if available first, to get the correct country code
    const userData = localStorage.getItem('user_data');
    let defaultCountryCode = '+966';
    if (userData) {
      try {
        this.user = JSON.parse(userData);
        if (this.user && this.user.country_code) {
          defaultCountryCode = this.user.country_code;
        }
        // Load license image if available
        if (this.user && this.user.license_image) {
          this.licenseImageUrl = this.user.license_image;
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    // Set selectedCountry based on user's country_code or default to Saudi Arabia
    const defaultCountry = this.countriesService.getCountryByDialCode(defaultCountryCode);
    this.selectedCountry = defaultCountry || this.countries[0];
    this.bookingForm.patchValue({ countryCode: this.selectedCountry.dialCode });

    // Load and apply user data if available
    if (userData && this.user) {
      const phoneWithoutCode = this.user.phone?.replace(defaultCountryCode, '') || '';
      this.bookingForm.patchValue({
        name: this.user.name || '',
        phone: phoneWithoutCode,
        countryCode: defaultCountryCode,
        email: this.user.email || ''
      });
    }

    // Initialize dates
    this.initializeDates();

    // Set default values
    if (this.availableDates.length > 0) {
      this.selectedDate = this.availableDates[0].value;
    }
    if (this.availableTimes.length > 0) {
      this.selectedTime = this.availableTimes[0];
    }

    // Calculate price from API after setting defaults
    setTimeout(() => {
      this.calculatePriceFromAPI();
    }, 100);

    // Load payment methods from API
    this.loadPaymentMethods();

    // Load booking terms from API
    this.loadBookingTerms();
  }

  loadBookingTerms() {
    this.bookingService.getBookingTerms().subscribe({
      next: (response) => {
        if (response.result && response.data && response.data.terms) {
          this.bookingTerms = response.data.terms.filter((term: any) => term.status === 'active');
        }
      },
      error: (error) => {
        console.error('Error loading booking terms:', error);
      }
    });
  }

  loadPaymentMethods() {
    this.isLoadingPaymentMethods = true;
    this.paymentService.getPaymentMethods().subscribe({
      next: (methods) => {
        // Only update if we got valid methods from API
        if (methods && methods.length > 0) {
          // Filter out Tabby payment method completely
          this.paymentMethods = methods.filter(method => {
            const methodName = (method.name || '').toLowerCase();
            const methodType = (method.type || '').toLowerCase();
            return !methodName.includes('tabby') && 
                   !methodName.includes('تابي') && 
                   !methodName.includes('ادفع لاحقًا') &&
                   methodType !== 'tabby';
          });
          
          // Filter out cash payment method (but keep "ادفع نقدا عند الاستلام" if total > 1000)
          const totalAmount = this.calculateTotal();
          this.paymentMethods = this.paymentMethods.filter(m => {
            const name = (m.name || '').toLowerCase();
            // Keep "ادفع نقدا عند الاستلام" only if total > 1000
            if (name.includes('ادفع نقدا عند الاستلام') || name.includes('pay cash on delivery')) {
              return totalAmount > 1000;
            }
            // Filter out other cash methods
            return !name.includes('نقدي') && !name.includes('cash');
          });
          
          
        } else {
         
          // Keep default methods but filter Tabby
          this.paymentMethods = this.paymentMethods.filter(method => {
            const methodName = (method.name || '').toLowerCase();
            return !methodName.includes('تابي');
          });
        }
        this.isLoadingPaymentMethods = false;
      },
      error: (error) => {
        console.error('Error loading payment methods:', error);
        // Keep default methods but filter Tabby
        this.paymentMethods = this.paymentMethods.filter(method => {
          const methodName = (method.name || '').toLowerCase();
          return !methodName.includes('تابي');
        });
        this.isLoadingPaymentMethods = false;
        // Don't show warning - just use defaults silently
      }
    });
  }

  ngOnDestroy() {
    this.unlockBodyScroll();
  }

  private lockBodyScroll() {
    if (this.scrollLocked) return;
    this.scrollLocked = true;

    this.lockedScrollY = window.scrollY || 0;
    const body = document.body;
    const html = document.documentElement;

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `0`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    html.style.overflow = 'hidden';
    html.style.height = '100%';
  }

  private unlockBodyScroll() {
    if (!this.scrollLocked) return;
    this.scrollLocked = false;

    const body = document.body;
    const html = document.documentElement;
    const y = this.lockedScrollY || 0;

    body.style.overflow = '';
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    html.style.overflow = '';
    html.style.height = '';

    window.scrollTo(0, y);
  }

  initializeDates() {
    const today = new Date();
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayName = i === 0 ? 'اليوم' : i === 1 ? 'غدا' : days[date.getDay()];
      const dayNumber = date.getDate();
      const monthName = months[date.getMonth()];

      this.availableDates.push({
        label: `${dayName} ${dayNumber}`,
        value: this.formatDate(date),
        date: date
      });
    }
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  toggleCountryDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.isCountryDropdownOpen = !this.isCountryDropdownOpen;
  }

  selectCountry(country: Country) {
    this.selectedCountry = country;
    this.bookingForm.patchValue({ countryCode: country.dialCode });
    this.isCountryDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.country-code-wrapper') && !target.closest('.country-dropdown')) {
      this.isCountryDropdownOpen = false;
    }
  }

  selectDate(dateValue: string) {
    this.selectedDate = dateValue;
    this.calculatePriceFromAPI();
  }

  selectTime(time: string) {
    this.selectedTime = time;
    this.calculatePriceFromAPI();
  }

  increaseDays() {
    this.totalDays++;
    this.calculatePriceFromAPI();
    // Reload payment methods when total changes (cash on delivery visibility depends on total > 1000)
    this.loadPaymentMethods();
  }

  decreaseDays() {
    if (this.totalDays > 1) {
      this.totalDays--;
      this.calculatePriceFromAPI();
      // Reload payment methods when total changes (cash on delivery visibility depends on total > 1000)
      this.loadPaymentMethods();
    }
  }

  selectDeliveryType(type: 'to_location' | 'from_branch') {
    this.deliveryType = type;
    this.calculatePriceFromAPI();
  }

  /**
   * Calculate price from API
   */
  calculatePriceFromAPI() {
    // Check if we have all required data
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return;
    }

    if (!this.selectedDate || !this.selectedTime) {
      return;
    }

    const carDetail = this.selectedCar.details[0];
    if (!carDetail || !carDetail.rental_company_id) {
      return;
    }

    // Prepare request
    const request = {
      booking_type: this.bookingType,
      rental_company_id: carDetail.rental_company_id,
      start_date: this.selectedDate,
      count: this.totalDays,
      car_id: this.selectedCar.id,
      start_time: this.convertTimeTo24Hour(this.selectedTime)
    };

    this.isLoadingPrice = true;
    this.bookingService.calculatePrice(request).subscribe({
      next: (response) => {
        this.isLoadingPrice = false;
        if (response.result && response.data) {
          this.priceData = response.data;
          // Update delivery fee and tax from API
          const deliveryFeesFromAPI = response.data.price_breakdown?.delivery_fees;
          // Only update if delivery_fees is a valid number (not null, undefined, or NaN)
          if (deliveryFeesFromAPI !== undefined && deliveryFeesFromAPI !== null && !isNaN(deliveryFeesFromAPI)) {
            this.deliveryFee = deliveryFeesFromAPI;
          }
          // Only update tax if it's a valid number
          const taxFromAPI = response.data.price_breakdown?.tax;
          if (taxFromAPI !== undefined && taxFromAPI !== null && !isNaN(taxFromAPI)) {
            this.taxAmount = taxFromAPI;
          }
          
        } else {
          console.error('Error calculating price:', response.message);
        }
      },
      error: (error) => {
        this.isLoadingPrice = false;
        console.error('Error calculating price:', error);
        // Don't show error to user, just use fallback calculation
      }
    });
  }

  selectPaymentMethod(methodId: number) {
    this.selectedPaymentMethod = methodId;
  }

  onLicenseFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB
        this.toastr.error('حجم الملف يجب أن يكون أقل من 5 ميجابايت', 'خطأ');
        event.target.value = ''; // Reset input
        return;
      }
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        this.toastr.error('نوع الملف غير مدعوم. يرجى اختيار PDF, PNG أو JPG', 'خطأ');
        event.target.value = ''; // Reset input
        return;
      }
      this.licenseFile = file;
      // Clear existing image URL when new file is selected
      this.licenseImageUrl = null;
    }
  }

  onEditLicenseImage() {
    const fileInput = document.getElementById('license') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  removeLicenseFile() {
    this.licenseFile = null;
    // Reset file input
    const fileInput = document.getElementById('license') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  closeModal() {
    this.isCountryDropdownOpen = false;
    this.unlockBodyScroll();
    this.modalService.closeModal();
  }

  // Helper function to format number with one decimal place
  formatToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
  }

  // Format number to string with one decimal, but remove .0 if it's a whole number
  formatNumber(value: number): string {
    const formatted = this.formatToOneDecimal(value);
    // If it's a whole number, return without decimal
    if (formatted % 1 === 0) {
      return formatted.toString();
    }
    // Otherwise return with one decimal place
    return formatted.toFixed(1);
  }

  // Get delivery fees from API or fallback
  getDeliveryFees(): number {
    if (this.priceData?.price_breakdown) {
      const fees = this.priceData.price_breakdown.delivery_fees;
      if (fees !== undefined && fees !== null && !isNaN(fees)) {
        return fees;
      }
    }
    return this.deliveryFee;
  }

  calculateTotal(): number {
    // Calculate services total first
    const servicesTotal = this.getSelectedServicesTotal();
    
    // Use price from API if available, but recalculate with our services
    if (this.priceData && this.priceData.price_breakdown) {
      const breakdown = this.priceData.price_breakdown;
      // Calculate total from breakdown components
      const basePrice = breakdown.base_price || 0;
      const deliveryFees = breakdown.delivery_fees || 0;
      const baseTax = breakdown.tax || 0;
      const discount = breakdown.discount || 0;
      const couponDiscount = breakdown.coupon_discount || 0;
      
      // Calculate subtotal: base price - discounts
      const subtotal = basePrice - discount - couponDiscount;
      
      // Calculate tax rate from API (tax / base_price)
      let taxRate = 0;
      if (basePrice > 0 && baseTax > 0) {
        taxRate = baseTax / basePrice;
      }
      
      // Calculate tax on services (apply same tax rate to services)
      const servicesTax = servicesTotal * taxRate;
      const totalTax = baseTax + servicesTax;
      
      // Add delivery fees, tax (including services tax), and services
      return this.formatToOneDecimal(subtotal + deliveryFees + totalTax + servicesTotal);
    }
    
    // Fallback to manual calculation if API data not available
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 0;
    }
    
    const periodType = this.getCurrentPeriodType();
    let price = 0;
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      price = this.getMonthlyPrice();
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      price = this.getWeeklyPrice();
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      price = this.getYearlyPrice();
    } else {
      // For daily, get price from period
      const dailyPrice = this.getDailyPrice();
      price = dailyPrice > 0 ? dailyPrice : this.selectedCar.details[0].price_per_day;
    }
    
    const subtotal = price * this.totalDays;
    // استخدام القيم من API إذا كانت متوفرة، وإلا استخدام القيم المحلية
    const deliveryFees = this.priceData?.price_breakdown?.delivery_fees ?? this.deliveryFee;
    const baseTax = this.priceData?.price_breakdown?.tax ?? this.taxAmount;
    
    // Calculate tax rate and apply to services
    let taxRate = 0;
    if (subtotal > 0 && baseTax > 0) {
      taxRate = baseTax / subtotal;
    }
    const servicesTax = servicesTotal * taxRate;
    const totalTax = baseTax + servicesTax;
    
    // إضافة رسوم التوصيل والضريبة (بما فيها ضريبة الخدمات) والخدمات الإضافية
    return this.formatToOneDecimal(subtotal + deliveryFees + totalTax + servicesTotal);
  }

  getSubtotal(): number {
    // Use price from API if available
    if (this.priceData && this.priceData.price_breakdown) {
      return this.formatToOneDecimal(this.priceData.price_breakdown.subtotal);
    }
    
    // Fallback to manual calculation if API data not available
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 0;
    }
    
    const periodType = this.getCurrentPeriodType();
    let price = 0;
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      price = this.getMonthlyPrice();
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      price = this.getWeeklyPrice();
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      price = this.getYearlyPrice();
    } else {
      // For daily, get price from period
      const dailyPrice = this.getDailyPrice();
      price = dailyPrice > 0 ? dailyPrice : this.selectedCar.details[0].price_per_day;
    }
    
    return this.formatToOneDecimal(price * this.totalDays);
  }

  /**
   * Auto-authenticate user in background without showing any UI
   * Tries register first, then login if register fails, then verify OTP
   */
  private async autoAuthenticate(countryCode: string, phone: string): Promise<void> {
    // First try to register
    try {
      const registerResponse = await firstValueFrom(
        this.authService.register(countryCode, phone)
      );

      // If register was successful (result: true), proceed to OTP verification
      if (!registerResponse.result) {
        // Register returned result: false, user might already exist, try login
        await this.loginAndVerifyOTP(countryCode, phone);
        return;
      }
    } catch (registerError) {
      // Register failed with error, go directly to login
      await this.loginAndVerifyOTP(countryCode, phone);
      return;
    }

    // Register was successful, now verify OTP
    await this.verifyOTPAndSave(countryCode, phone);
  }

  /**
   * Login and then verify OTP
   */
  private async loginAndVerifyOTP(countryCode: string, phone: string): Promise<void> {
    try {
      await firstValueFrom(
        this.authService.login(countryCode, phone)
      );
      // Login successful, now verify OTP
      await this.verifyOTPAndSave(countryCode, phone);
    } catch (loginError) {
      throw new Error('Failed to authenticate user');
    }
  }

  /**
   * Verify OTP and save token
   */
  private async verifyOTPAndSave(countryCode: string, phone: string): Promise<void> {
    try {
      const otpResponse = await firstValueFrom(
        this.authService.verifyOTP(countryCode, phone, '1234')
      );

      if (otpResponse.result && otpResponse.data?.user?.token) {
        // Save token and user data
        localStorage.setItem('auth_token', otpResponse.data.user.token);
        localStorage.setItem('user_data', JSON.stringify(otpResponse.data.user));
        this.user = otpResponse.data.user;
       
      } else {
        throw new Error('OTP verification failed');
      }
    } catch (otpError) {
      throw new Error('OTP verification failed');
    }
  }

  async onSubmit() {
  

    // Immediately show spinner + prevent double submit
    if (this.isLoading) {
      return;
    }
    this.isLoading = true;
    
    // Mark all form fields as touched to show validation errors
    Object.keys(this.bookingForm.controls).forEach(key => {
      this.bookingForm.get(key)?.markAsTouched();
    });
    
    // Check if location is selected but address not filled
    if (this.selectedLocation && !this.bookingForm.get('address')?.value) {
      this.bookingForm.patchValue({
        address: this.selectedLocation.address
      });
    }

    if (this.bookingForm.invalid) {
      
      
      // Check which fields are invalid and show specific message
      const invalidFields: string[] = [];
      if (this.bookingForm.get('name')?.invalid) invalidFields.push('الاسم');
      if (this.bookingForm.get('phone')?.invalid) invalidFields.push('رقم الهاتف');
      if (this.bookingForm.get('address')?.invalid || !this.selectedLocation) {
        invalidFields.push('موقع الاستلام');
      }
      if (this.bookingForm.get('city')?.invalid) invalidFields.push('المدينة');
      
      const message = invalidFields.length > 0 
        ? `يرجى ملء الحقول التالية: ${invalidFields.join('، ')}`
        : 'يرجى ملء جميع الحقول المطلوبة';
      
      // Show error with longer timeout and make it more visible
      this.toastr.error(message, 'حقول مطلوبة', {
        timeOut: 5000,
        positionClass: 'toast-top-center',
        closeButton: true,
        progressBar: true
      });
      
      // Scroll to first invalid field
      this.scrollToFirstInvalidField();
      
      this.isLoading = false;
      return;
    }

    if (!this.selectedCar) {
      this.toastr.error('لم يتم اختيار سيارة', 'خطأ');
      this.isLoading = false;
      return;
    }

    if (!this.selectedDate || !this.selectedTime) {
      const missingFields: string[] = [];
      if (!this.selectedDate) missingFields.push('تاريخ الاستلام');
      if (!this.selectedTime) missingFields.push('وقت الاستلام');
      this.toastr.warning(`يرجى اختيار: ${missingFields.join(' و ')}`, 'تحذير');
      this.isLoading = false;
      return;
    }

    if (this.selectedPaymentMethod === null || this.selectedPaymentMethod === undefined) {
   
      this.toastr.warning('يرجى اختيار طريقة الدفع', 'تحذير');
      this.isLoading = false;
      return;
    }

    const formValue = this.bookingForm.value;
    const token = localStorage.getItem('auth_token');
    
    

    // Check if user is authenticated, if not, show OTP popup
    if (!token) {
     
      // Register/Login first to send OTP
      try {
        await this.initiateAuth(formValue.countryCode, formValue.phone);
        
        // Set callback to continue booking after OTP verification
        this.modalService.setOTPVerifiedCallback(() => {
          // Continue booking directly without reopening modal (booking modal is still open behind OTP)
          setTimeout(() => {
            this.confirmBooking();
          }, 300);
        });
        
        // Show OTP popup
        this.modalService.setOTPData(formValue.countryCode, formValue.phone);
        this.modalService.openModal('otp');
        // Stop spinner while user is entering OTP
        this.isLoading = false;
        return;
      } catch (error) {
        console.error('Auth initiation error:', error);
        this.toastr.error('حدث خطأ أثناء إرسال رمز التحقق. يرجى المحاولة مرة أخرى', 'خطأ');
        this.isLoading = false;
        return;
      }
    }

    // User is already authenticated, proceed with booking
    // confirmBooking will keep the spinner until request finishes
    this.confirmBooking();
  }

  async initiateAuth(countryCode: string, phone: string): Promise<void> {
    try {
      // Try register first
      try {
        await firstValueFrom(this.authService.register(countryCode, phone));
        return;
      } catch (registerError) {
        // If register fails, try login
        await firstValueFrom(this.authService.login(countryCode, phone));
        return;
      }
    } catch (error) {
      console.error('Both register and login failed:', error);
      throw new Error('Failed to initiate authentication');
    }
  }

  async confirmBooking() {
    this.isLoading = true;

    try {
      if (!this.selectedCar) {
        this.isLoading = false;
        this.toastr.error('لم يتم اختيار سيارة', 'خطأ');
        return;
      }

      if (this.selectedPaymentMethod === null || this.selectedPaymentMethod === undefined) {
        this.isLoading = false;
        this.toastr.warning('يرجى اختيار طريقة الدفع', 'تحذير');
        return;
      }

      // Check if license image is required (only if not already saved)
      if (!this.licenseFile && !this.licenseImageUrl) {
        this.isLoading = false;
        this.toastr.error('يرجى رفع صورة الرخصة', 'خطأ');
        return;
      }

      const formValue = this.bookingForm.value;

      // Get period ID based on booking type (daily/monthly)
      let periodId = this.bookingType === 'monthly' ? this.getMonthlyPeriodId() : this.getDailyPeriodId();

      // If user selected monthly but the car doesn't support monthly, fallback to daily
      if (this.bookingType === 'monthly' && !periodId) {
        this.toastr.warning('هذه السيارة غير متاحة للحجز الشهري. سيتم الحجز يومياً', 'تنبيه');
        this.bookingType = 'daily';
        // Try to get daily period ID
        const dailyPeriodId = this.getDailyPeriodId();
        if (dailyPeriodId) {
          periodId = dailyPeriodId;
        }
      }

      // Check if car details exist
      if (!this.selectedCar.details || !Array.isArray(this.selectedCar.details) || this.selectedCar.details.length === 0) {
        this.isLoading = false;
        this.toastr.error('بيانات السيارة غير كاملة. يرجى المحاولة مرة أخرى', 'خطأ');
        return;
      }

      const carDetail = this.selectedCar.details[0];
     
      if (!carDetail || !carDetail.rental_company_id) {
        this.isLoading = false;
        this.toastr.error('بيانات شركة التأجير غير متوفرة. يرجى المحاولة مرة أخرى', 'خطأ');
        return;
      }

      // Get selected payment method to get index
      const selectedMethod = this.paymentMethods.find(m => m.id === this.selectedPaymentMethod);
      const paymentIndex = selectedMethod?.index ?? 0;

      const totalAmount = this.calculateTotal();

      // Prepare booking request data (will be used after payment)
      const bookingRequest: BookingRequest = {
        amount: totalAmount,
        address: formValue.address,
        city: formValue.city,
        rental_company_id: carDetail.rental_company_id,
        car_id: this.selectedCar.id,
        category_id: this.selectedCar.car_category.id,
        payment_method_id: this.selectedPaymentMethod || undefined,
        index: paymentIndex,
        booking_type: this.bookingType,
        start_date: this.selectedDate,
        start_time: this.convertTimeTo24Hour(this.selectedTime),
        total_days: this.totalDays,
        delivery_type: this.deliveryType,
        delivery_address: formValue.address,
        delivery_latitude: this.selectedLocation?.lat || 24.7136,
        delivery_longitude: this.selectedLocation?.lng || 46.6753
      };

      // Add period ID if found in car details
      if (periodId) {
        bookingRequest.rental_company_car_period_id = periodId;
      } else {
        // For daily bookings only: try to get first available period as fallback
        if (this.bookingType === 'daily' && carDetail.periods && Array.isArray(carDetail.periods) && carDetail.periods.length > 0) {
          const firstPeriod = carDetail.periods.find((p: any) => p?.id);
          if (firstPeriod && firstPeriod.id) {
            bookingRequest.rental_company_car_period_id = firstPeriod.id;
          } else {
          }
        } else {
        }
      }

      if (formValue.email) {
        bookingRequest.email = formValue.email;
      }
      if (formValue.zip) {
        bookingRequest.zip = formValue.zip;
      }

      // Add insurance_type_id from car details if available
      if (carDetail.insurance_types && Array.isArray(carDetail.insurance_types) && carDetail.insurance_types.length > 0) {
        const firstInsuranceType = carDetail.insurance_types.find((it: any) => it?.id);
        if (firstInsuranceType && firstInsuranceType.id) {
          bookingRequest.insurance_type_id = firstInsuranceType.id;
        }
      }

      // Add selected additional services
      if (this.selectedAdditionalServices.length > 0) {
        bookingRequest.additional_services = this.selectedAdditionalServices;
      } else {
        // Don't set additional_services if empty - let service handle it
        // API expects additional_services only if there are services, otherwise omit it
        bookingRequest.additional_services = undefined;
      }

      // Generate UUID for payment
      const bookingUuid = this.generateUUID();
      bookingRequest.uuid = bookingUuid;

      // Get selected payment method details
      const paymentType = selectedMethod?.type || 'card';

      // Store booking data temporarily before payment
      const bookingData = {
        bookingRequest: bookingRequest,
        uuid: bookingUuid,
        formValue: formValue,
        selectedCar: this.selectedCar,
        bookingType: this.bookingType,
        selectedDate: this.selectedDate,
        selectedTime: this.selectedTime,
        totalDays: this.totalDays,
        deliveryType: this.deliveryType,
        selectedLocation: this.selectedLocation,
        paymentType: paymentType,
        paymentIndex: paymentIndex,
        timestamp: Date.now() // Add timestamp for expiration check
      };
      sessionStorage.setItem('pending_booking', JSON.stringify(bookingData));

     
      
      // Check if payment method is "أدفع نقدا عند الإستلام" (Cash on Delivery)
      const isCashOnDelivery = this.selectedPaymentMethod === 12 || 
                               selectedMethod?.name?.includes('أدفع نقدا عند الإستلام') ||
                               selectedMethod?.name?.includes('pay cash on delivery') ||
                               selectedMethod?.name?.toLowerCase().includes('cash on delivery');
      
      if (isCashOnDelivery) {
        // For cash on delivery, create booking directly without payment processing
        this.createBookingDirectly(bookingRequest, formValue);
      } else {
        // Process payment first, then create booking after payment is confirmed
        this.processPaymentBeforeBooking(totalAmount, bookingUuid, paymentType, paymentIndex);
      }
    } catch (error) {
      console.error('Error in confirmBooking:', error);
      this.isLoading = false;
      this.toastr.error('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى', 'خطأ');
    }
  }

  /**
   * Build Paymob payment URL for Visa/Mastercard using iframe
   * Format: https://ksa.paymob.com/api/acceptance/iframes/9472?payment_token=PAYMENT_KEY
   */
  buildPaymobIframeUrl(paymentToken: string): string {
    // Build Paymob iframe URL - payment_token is the dynamic payment key
    // Format: https://ksa.paymob.com/api/acceptance/iframes/9472?payment_token=PAYMENT_KEY
    const paymobUrl = `https://ksa.paymob.com/api/acceptance/iframes/9472?payment_token=${paymentToken}`;
    
    
    return paymobUrl;
  }

  /**
   * Try to build PayMob URL from payment ID
   */
  tryBuildPayMobUrl(paymentId: string, bookingUuid: string, orderId: number | null) {
    // PayMob typically uses iframe URLs
    // Since we don't have the token directly, we might need to use payment ID
    this.isLoading = false;
    this.toastr.warning('يرجى الانتظار، جاري إعداد صفحة الدفع...', 'تنبيه');
    
    // Store payment info
    const bookingData = sessionStorage.getItem('pending_booking');
    if (bookingData) {
      try {
        const data = JSON.parse(bookingData);
        data.paymentId = paymentId;
        data.needsPaymentUrl = true;
        sessionStorage.setItem('pending_booking', JSON.stringify(data));
      } catch (e) {
        console.error('Error updating booking data:', e);
      }
    }
    
    // Show error message
    this.toastr.error('لم يتم العثور على رابط الدفع. يرجى التواصل مع الدعم الفني', 'خطأ');
  }

  /**
   * Process payment before creating booking
   */
  processPaymentBeforeBooking(
    totalAmount: number,
    bookingUuid: string,
    paymentType: string,
    paymentIndex: number
  ) {

    // Get form values
    const formValue = this.bookingForm.value;
    
    // Prepare payment checkout request with all required fields
    const paymentRequest: PaymentCheckoutRequest = {
      amount: totalAmount,
      payment_method: this.selectedPaymentMethod || 0,
      index: paymentIndex,
      address: formValue.address || this.selectedLocation?.address || '',
      city: formValue.city || 'الرياض',
      car_name: this.selectedCar?.name || '',
      zip: formValue.zip || '',
      uuid: bookingUuid
    };


    // Call payment API for all payment types
    this.paymentService.processCheckout(paymentRequest).subscribe({
      next: (paymentResponse) => {
        
        // Extract redirection URL from response based on payment index
        let paymentUrl: string | null = null;
        let orderId: number | null = null;
        let paymentId: string | null = null;
        let isPaymob = false;
        let clientSecret: string | null = null;
        let paymentToken: string | null = null;

        // Check for PayMob payment - Priority: payment_keys[0].key
        // For Apple Pay (index 0), use iframe URL with payment_token (same as Visa/Mastercard)
        if (paymentIndex === 0) {
          // Apple Pay: Use iframe URL with payment_token from payment_keys[0].key
          if (paymentResponse.data?.payment?.payment_keys && paymentResponse.data.payment.payment_keys.length > 0) {
            const paymentKey = paymentResponse.data.payment.payment_keys[0] as any;
            if (paymentKey.key) {
              isPaymob = true;
              paymentToken = paymentKey.key;
              paymentId = paymentResponse.data.payment.id || null;
              orderId = paymentKey.order_id || null;
              
              
              // Build Paymob iframe URL using payment_key.key for Apple Pay
              if (paymentToken) {
                paymentUrl = this.buildPaymobIframeUrl(paymentToken);
              }
            } else if (paymentKey.redirection_url) {
              // Fallback: use redirection_url if key not available
              isPaymob = true;
              paymentToken = paymentKey.key || null;
              paymentId = paymentResponse.data.payment.id || null;
              orderId = paymentKey.order_id || null;
              
              paymentUrl = paymentKey.redirection_url;
            }
          }
        } else {
          // For Visa/Mastercard (index 1), use iframe URL with payment_token
          // First check data.payment.payment_keys[0].key (primary source)
          if (paymentResponse.data?.payment?.payment_keys && paymentResponse.data.payment.payment_keys.length > 0) {
            const paymentKey = paymentResponse.data.payment.payment_keys[0] as any;
            if (paymentKey.key) {
              isPaymob = true;
              paymentToken = paymentKey.key;
              paymentId = paymentResponse.data.payment.id || null;
              orderId = paymentKey.order_id || null;
              
              
              // Build Paymob iframe URL using payment_key.key for Visa/Mastercard
              if (paymentToken) {
                paymentUrl = this.buildPaymobIframeUrl(paymentToken);
              }
            }
          }
          // Check top-level payment_token (fallback for Visa/Mastercard)
          else if (paymentResponse.payment_token) {
            isPaymob = true;
            paymentToken = paymentResponse.payment_token;
            
            // Build Paymob iframe URL using payment_token
            if (paymentToken) {
              paymentUrl = this.buildPaymobIframeUrl(paymentToken);
            }
          }
          // Check nested payment_token (fallback for Visa/Mastercard)
          else if (paymentResponse.data?.payment?.payment_token) {
            isPaymob = true;
            paymentToken = paymentResponse.data.payment.payment_token;
            paymentId = paymentResponse.data.payment.id || null;
            
            // Build Paymob iframe URL using payment_token
            if (paymentToken) {
              paymentUrl = this.buildPaymobIframeUrl(paymentToken);
            }
          }
          // Check top-level client_secret (last fallback - only for Visa/Mastercard)
          else if (paymentResponse.client_secret) {
            isPaymob = true;
            clientSecret = paymentResponse.client_secret;
            paymentToken = paymentResponse.client_secret; // Use client_secret as payment_token
            
            // Build Paymob iframe URL using client_secret as payment_token
            if (paymentToken) {
              paymentUrl = this.buildPaymobIframeUrl(paymentToken);
            }
          }
          // Check nested client_secret (last fallback - only for Visa/Mastercard)
          else if (paymentResponse.data?.payment?.client_secret) {
            isPaymob = true;
            clientSecret = paymentResponse.data.payment.client_secret;
            paymentToken = paymentResponse.data.payment.client_secret; // Use client_secret as payment_token
            paymentId = paymentResponse.data.payment.id || null;
            
            // Build Paymob iframe URL using client_secret as payment_token
            if (paymentToken) {
              paymentUrl = this.buildPaymobIframeUrl(paymentToken);
            }
          }
        }
        
        // Check for Tabby and Tamara if payment data exists
        if (paymentResponse.data?.payment && !paymentUrl) {
          const paymentData = paymentResponse.data.payment as any;
          if (!paymentId) {
            paymentId = paymentData.id || null;
          }
          
          // Check for Tabby (index 2) - look for web_url
          if (paymentIndex === 2) {
            // Tabby response structure: data.payment.configuration.available_products.installments[0].web_url
            if (paymentData.configuration?.available_products?.installments) {
              const installments = paymentData.configuration.available_products.installments;
              if (Array.isArray(installments) && installments.length > 0) {
                const firstInstallment = installments[0];
                if (firstInstallment.web_url) {
                  paymentUrl = firstInstallment.web_url;
                }
              }
            }
            
            // Also check direct web_url in response
            if (!paymentUrl && paymentResponse.data?.web_url) {
              paymentUrl = paymentResponse.data.web_url;
            }
            
            // Add email registration parameter to Tabby URL (force email instead of phone)
            if (paymentUrl) {
              const formValue = this.bookingForm.value;
              const userEmail = formValue.email || '';
              
              // Add parameters to force email registration
              const separator = paymentUrl.includes('?') ? '&' : '?';
              paymentUrl = `${paymentUrl}${separator}registration_method=email`;
              
              // If user has email, add it to URL
              if (userEmail) {
                paymentUrl = `${paymentUrl}&email=${encodeURIComponent(userEmail)}`;
              }
              
            }
          }
          
          // Check for Tamara (index 3) - look for checkout_url
          if (paymentIndex === 3 && !paymentUrl) {
            // Tamara response structure: data.payment.checkout_url
            if (paymentData.checkout_url) {
              paymentUrl = paymentData.checkout_url;
            }
            
            // Also check in data level
            if (!paymentUrl && paymentResponse.data?.checkout_url) {
              paymentUrl = paymentResponse.data.checkout_url;
            }
          }
          
          // Fallback: Try to get URL from payment object directly
          if (!paymentUrl && !isPaymob) {
            paymentUrl = paymentData.redirection_url || 
                        paymentData.payment_url ||
                        paymentData.checkout_url ||
                        paymentData.url ||
                        null;
          }
        }
        
        // Check top-level response fields
        if (!paymentUrl) {
          paymentUrl = paymentResponse.data?.redirect_url || 
                      paymentResponse.data?.payment_url ||
                      paymentResponse.redirect_url || 
                      paymentResponse.payment_url || 
                      paymentResponse.checkout_url ||
                      paymentResponse.tabby_url ||
                      paymentResponse.tamara_url ||
                      null;
        }
        
        // Handle Tabby web_url from top-level response (add email registration)
        if (paymentIndex === 2 && !paymentUrl) {
          const tabbyUrl = paymentResponse.data?.web_url || paymentResponse.web_url;
          if (tabbyUrl) {
            paymentUrl = tabbyUrl;
            const formValue = this.bookingForm.value;
            const userEmail = formValue.email || '';
            
            // Add parameters to force email registration
            const separator = paymentUrl.includes('?') ? '&' : '?';
            paymentUrl = `${paymentUrl}${separator}registration_method=email`;
            
            // If user has email, add it to URL
            if (userEmail) {
              paymentUrl = `${paymentUrl}&email=${encodeURIComponent(userEmail)}`;
            }
            
          }
        }
        
        // Handle Tamara checkout_url from top-level response
        if (paymentIndex === 3 && !paymentUrl) {
          paymentUrl = paymentResponse.data?.checkout_url || paymentResponse.checkout_url || null;
          if (paymentUrl) {
          }
        }

        // If still no URL, try to get it from payment service using payment ID
        if (!paymentUrl && paymentId) {
          this.paymentService.getPaymentCheckoutUrl(paymentId).subscribe({
            next: (urlResponse) => {
              const url = urlResponse.data?.url || 
                         urlResponse.url || 
                         urlResponse.data?.payment_url ||
                         urlResponse.payment_url ||
                         null;
              
              if (url) {
                this.openPaymentWindow(url, bookingUuid, orderId, paymentIndex);
              } else {
                // Try to build PayMob URL
                this.tryBuildPayMobUrl(paymentId, bookingUuid, orderId);
              }
            },
            error: (urlError) => {
              console.error('Error getting payment URL:', urlError);
              // Try to build PayMob URL as fallback
              this.tryBuildPayMobUrl(paymentId, bookingUuid, orderId);
            }
          });
          return; // Exit early, will continue in callback
        }

        if (paymentUrl) {
          // Store payment ID, payment_token, and client_secret for status checking
          const bookingData = sessionStorage.getItem('pending_booking');
          if (bookingData) {
            try {
              const data = JSON.parse(bookingData);
              if (paymentId) {
                data.paymentId = paymentId;
              }
              if (paymentToken) {
                data.paymentToken = paymentToken;
              }
              if (clientSecret) {
                data.clientSecret = clientSecret;
              }
              if (isPaymob) {
                data.isPaymob = true;
              }
              sessionStorage.setItem('pending_booking', JSON.stringify(data));
            } catch (e) {
              console.error('Error updating booking data:', e);
            }
          }
          // Open payment URL in new window and monitor for completion
          this.openPaymentWindow(paymentUrl, bookingUuid, orderId, paymentIndex);
        } else {
          console.error('No payment URL found in response');
          console.error('Payment response structure:', JSON.stringify(paymentResponse, null, 2));
          this.isLoading = false;
          this.toastr.error('لم يتم العثور على رابط الدفع. يرجى المحاولة مرة أخرى', 'خطأ');
          // Clear pending booking if payment fails
          sessionStorage.removeItem('pending_booking');
        }
      },
      error: (error) => {
        console.error('Payment checkout error:', error);
        this.isLoading = false;
        this.toastr.error(error.error?.message || 'حدث خطأ أثناء معالجة الدفع', 'خطأ');
        // Clear pending booking if payment fails
        sessionStorage.removeItem('pending_booking');
      }
    });
  }

  
  processPaymentAfterBooking(
    bookingResponse: any,
    bookingUuid: string,
    paymentType: string,
    paymentIndex: number,
    formValue: any
  ) {
    const totalAmount = this.calculateTotal();

    // Prepare payment checkout request with all required fields
    const paymentRequest: PaymentCheckoutRequest = {
      amount: totalAmount,
      payment_method: this.selectedPaymentMethod || 0,
      index: paymentIndex,
      address: formValue.address || this.selectedLocation?.address || '',
      city: formValue.city || 'الرياض',
      car_name: this.selectedCar?.name || '',
      zip: formValue.zip || '',
      uuid: bookingUuid
    };


    // Call payment API for all payment types
    this.paymentService.processCheckout(paymentRequest).subscribe({
      next: (paymentResponse) => {
        
        // Extract redirection URL from response
        let paymentUrl: string | null = null;
        let orderId: number | null = null;

        if (paymentResponse.data?.payment?.payment_keys && paymentResponse.data.payment.payment_keys.length > 0) {
          const paymentKey = paymentResponse.data.payment.payment_keys[0];
          paymentUrl = paymentKey.redirection_url || null;
          orderId = paymentKey.order_id || null;
        }

        // Fallback: try other possible locations
        if (!paymentUrl) {
          paymentUrl = paymentResponse.data?.redirect_url || 
                      paymentResponse.data?.payment_url ||
                      paymentResponse.redirect_url || 
                      paymentResponse.payment_url || 
                      paymentResponse.checkout_url ||
                      paymentResponse.tabby_url ||
                      paymentResponse.tamara_url ||
                      null;
        }

        if (paymentUrl) {
          // Open payment URL in new window and monitor for completion
          this.openPaymentWindow(paymentUrl, bookingUuid, orderId, paymentIndex);
        } else {
          console.error('No payment URL found in response');
          this.isLoading = false;
          this.toastr.error('لم يتم العثور على رابط الدفع', 'خطأ');
        }
      },
      error: (error) => {
        console.error('Payment checkout error:', error);
        this.isLoading = false;
        this.toastr.error(error.error?.message || 'حدث خطأ أثناء معالجة الدفع', 'خطأ');
      }
    });
  }

  
  openPaymentWindow(paymentUrl: string, bookingUuid: string, orderId: number | null = null, paymentIndex: number = 1) {
    // Show message to user
    this.toastr.info('سيتم فتح صفحة الدفع في نافذة جديدة', 'معلومة');
    
    // For Tabby (index 2) and Tamara (index 3), we need to handle success callbacks
    const isTabby = paymentIndex === 2;
    const isTamara = paymentIndex === 3;
    
    // Open payment in new window
    const paymentWindow = window.open(
      paymentUrl,
      'payment',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    if (!paymentWindow) {
      this.toastr.error('يرجى السماح بفتح النوافذ المنبثقة للدفع', 'تحذير');
      this.isLoading = false;
      // Fallback: redirect in same window
      window.location.href = paymentUrl;
      return;
    }

    // Verify window opened successfully
    setTimeout(() => {
      if (paymentWindow.closed) {
        console.warn('Payment window closed immediately - may be blocked by popup blocker');
        this.toastr.warning('تم حظر النافذة المنبثقة. سيتم التوجيه إلى صفحة الدفع في نفس النافذة', 'تحذير');
        this.isLoading = false;
        window.location.href = paymentUrl;
      }
    }, 500);

    // Booking data is already stored in sessionStorage from  
    // Just update orderId if available
    const storedBookingData = sessionStorage.getItem('pending_booking');
    if (storedBookingData) {
      try {
        const bookingData = JSON.parse(storedBookingData);
        bookingData.orderId = orderId;
        bookingData.paymentIndex = paymentIndex; // Store payment index for callback handling
        sessionStorage.setItem('pending_booking', JSON.stringify(bookingData));
      } catch (e) {
        console.error('Error updating booking data:', e);
      }
    }

    // Monitor payment window
    let checkCount = 0;
    const maxChecks = 300; // 5 minutes max (300 * 1 second)
    
    const checkPaymentInterval = setInterval(() => {
      checkCount++;
      
      // Check if window is closed
      if (paymentWindow.closed) {
        clearInterval(checkPaymentInterval);
        
        // Get payment ID from stored booking data
        const storedBookingData = sessionStorage.getItem('pending_booking');
        let paymentId: string | null = null;
        if (storedBookingData) {
          try {
            const bookingData = JSON.parse(storedBookingData);
            paymentId = bookingData.paymentId || null;
          } catch (e) {
            console.error('Error parsing booking data:', e);
          }
        }
        
        // Check payment status after window closes
        if (paymentId) {
          this.isLoading = true;
          this.toastr.info('جاري التحقق من حالة الدفع...', 'معلومة');
          
          // Wait a moment then check payment status
          setTimeout(() => {
            this.checkPaymentStatusByPaymentId(paymentId!, bookingUuid);
          }, 2000);
        } else {
          // For Tabby and Tamara, check URL for success callback
          if (isTabby || isTamara) {
            this.isLoading = false;
            
            // Wait a bit then check for success callback
            setTimeout(() => {
              this.checkTabbyTamaraPaymentSuccess(bookingUuid, isTabby, isTamara);
            }, 2000);
          } else {
            // For PayMob and other gateways, wait for callback
        this.isLoading = false;
        this.toastr.info('يرجى الانتظار حتى يتم تأكيد الدفع...', 'معلومة');
          }
        }
        return;
      }

      // Try to check payment status by polling (if orderId is available)
      // For Tabby/Tamara, we might need different polling logic
      if (orderId && checkCount % 10 === 0 && !isTabby && !isTamara) { // Check every 10 seconds (not for Tabby/Tamara)
        this.checkPaymentStatus(orderId).subscribe({
          next: (statusResponse) => {
            if (statusResponse?.result && statusResponse?.data?.confirmed) {
              clearInterval(checkPaymentInterval);
              paymentWindow.close();
              this.createBookingAfterPayment();
            }
          },
          error: (error) => {
          }
        });
      }

      // Timeout after max checks
      if (checkCount >= maxChecks) {
        clearInterval(checkPaymentInterval);
        this.toastr.warning('انتهت مدة انتظار الدفع. يرجى التحقق من حالة الدفع يدوياً', 'تحذير');
        this.isLoading = false;
      }
    }, 1000);
  }

  /**
   * Check payment status by payment ID
   * @param paymentId The payment ID to check
   * @param bookingUuid The booking UUID
   * @param retryCount Current retry count (default: 0)
   * @param maxRetries Maximum number of retries (default: 20 = 1 minute)
   */
  checkPaymentStatusByPaymentId(paymentId: string, bookingUuid: string, retryCount: number = 0, maxRetries: number = 20) {
    
    // Check if we've exceeded max retries
    if (retryCount >= maxRetries) {
      this.isLoading = false;
      this.toastr.warning('انتهت مدة انتظار الدفع. يرجى التحقق من حالة الدفع يدوياً', 'تحذير');
      return;
    }
    
    this.paymentService.checkPaymentStatusByPaymentId(paymentId).subscribe({
      next: (response) => {
        
        // Check if payment was successful
        if (response.result === true && response.errNum === 200 && response.message === 'Payment successful') {
          this.isLoading = true;
          this.toastr.success('تم الدفع بنجاح! جاري إنشاء الحجز...', 'نجح');
          
          // Create booking after successful payment
          this.createBookingAfterPayment();
        } else {
          
          // Retry checking after a delay
          setTimeout(() => {
            this.checkPaymentStatusByPaymentId(paymentId, bookingUuid, retryCount + 1, maxRetries);
          }, 3000); // Check again after 3 seconds
        }
      },
      error: (error) => {
        console.error('Error checking payment status:', error);
        
        // Only retry on network errors, not on 404 or other errors
        if (error.status !== 404 && retryCount < maxRetries) {
          // Retry checking after a delay
          setTimeout(() => {
            this.checkPaymentStatusByPaymentId(paymentId, bookingUuid, retryCount + 1, maxRetries);
          }, 3000); // Check again after 3 seconds
        } else {
          this.isLoading = false;
          this.toastr.warning('لم يتم تأكيد الدفع. يرجى التحقق من حالة الدفع يدوياً', 'تحذير');
        }
      }
    });
  }

  /**
   * Check Tabby/Tamara payment success
   */
  checkTabbyTamaraPaymentSuccess(bookingUuid: string, isTabby: boolean, isTamara: boolean) {
    // Check URL parameters for success callback
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const status = urlParams.get('status');
    
    if (success === 'true' || status === 'success') {
      this.createBookingAfterPayment();
    } else {
      // If no URL params, check if we can detect success from sessionStorage or other means
      // For now, show message to user
      this.toastr.info('يرجى التحقق من حالة الدفع. إذا تم الدفع بنجاح، سيتم إنشاء الحجز تلقائياً', 'معلومة');
    }
  }

  /**
   * Check payment status
   */
  checkPaymentStatus(orderId: number) {
    // This should call an API endpoint to check payment status
    // For now, we'll use a placeholder - you may need to implement this endpoint
    return this.paymentService.checkPaymentStatus(orderId);
  }

  /**
   * Check payment and create booking
   */
  checkPaymentAndCreateBooking(orderId: number) {
    this.isLoading = true;
    this.toastr.info('جاري التحقق من حالة الدفع...', 'معلومة');
    
    this.checkPaymentStatus(orderId).subscribe({
      next: (statusResponse) => {
        if (statusResponse?.result && statusResponse?.data?.confirmed) {
          this.createBookingAfterPayment();
        } else {
          this.isLoading = false;
          this.toastr.warning('لم يتم تأكيد الدفع بعد. يرجى التحقق من حالة الدفع أو المحاولة مرة أخرى', 'تحذير');
        }
      },
      error: (error) => {
        console.error('Error checking payment status:', error);
        // Don't assume payment completed - wait for callback
        this.isLoading = false;
        this.toastr.info('يرجى الانتظار حتى يتم تأكيد الدفع من PayMob...', 'معلومة');
      }
    });
  }

  /**
   * Create booking directly without payment processing (for cash on delivery)
   */
  createBookingDirectly(bookingRequest: BookingRequest, formValue: any) {
    this.isLoading = true;

    // Create booking directly
    this.bookingService.createBooking(bookingRequest).subscribe({
      next: (response) => {
        if (response.result) {
          
          // Save profile data to localStorage
          const userData = localStorage.getItem('user_data');
          let user: any = {};
          
          if (userData) {
            try {
              user = JSON.parse(userData);
            } catch (e) {
              console.error('Error parsing user data:', e);
            }
          }
          
          // Function to save user data
          const saveUserData = (licenseImageUrl: string = user.license_image || '') => {
            const updatedUser = {
              ...user,
              name: formValue.name || user.name || '',
              phone: formValue.phone || user.phone || '',
              country_code: formValue.countryCode || user.country_code || '+966',
              license_image: licenseImageUrl
            };
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
          };
          
          // If license file was uploaded, convert it to base64 for storage
          if (this.licenseFile) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
              const licenseImageUrl = e.target.result;
              saveUserData(licenseImageUrl);
              this.modalService.closeModal();
              setTimeout(() => {
                this.modalService.openModal('booking-confirmation');
                this.isLoading = false;
              }, 500);
            };
            reader.onerror = () => {
              console.error('Error reading license file');
              saveUserData(); // Save without license image if read fails
              this.modalService.closeModal();
              setTimeout(() => {
                this.modalService.openModal('booking-confirmation');
                this.isLoading = false;
              }, 500);
            };
            reader.readAsDataURL(this.licenseFile);
          } else {
            saveUserData(); // Save without license image if no file
            
            // Close booking modal
            this.modalService.closeModal();
            
            // Show confirmation
            setTimeout(() => {
              this.modalService.openModal('booking-confirmation');
              this.isLoading = false;
            }, 500);
          }
        } else {
          console.error('Booking creation failed:', response);
          this.isLoading = false;
          this.toastr.error(response.message || 'فشل إنشاء الحجز', 'خطأ');
        }
      },
      error: (error) => {
        console.error('Error creating booking:', error);
        this.isLoading = false;
        const errorMessage = error?.error?.message || error?.message || 'حدث خطأ أثناء إنشاء الحجز';
        this.toastr.error(errorMessage, 'خطأ');
      }
    });
  }

  /**
   * Create booking after successful payment
   */
  createBookingAfterPayment() {
    this.isLoading = true;
    this.toastr.success('تم الدفع بنجاح! جاري إنشاء الحجز...', 'نجح');
    
    // Get booking data from sessionStorage
    const storedBookingData = sessionStorage.getItem('pending_booking');
    if (!storedBookingData) {
      console.error('No pending booking data found');
      this.isLoading = false;
      this.toastr.error('لم يتم العثور على بيانات الحجز', 'خطأ');
      return;
    }

    let bookingData: any;
    try {
      bookingData = JSON.parse(storedBookingData);
    } catch (e) {
      console.error('Error parsing booking data:', e);
      this.isLoading = false;
      this.toastr.error('خطأ في بيانات الحجز', 'خطأ');
      return;
    }

    const bookingRequest = bookingData.bookingRequest;

    // Create booking
    this.bookingService.createBooking(bookingRequest).subscribe({
      next: (response) => {
        if (response.result) {
          
          // Save profile data to localStorage
          const formValue = bookingData.formValue;
          const userData = localStorage.getItem('user_data');
          let user: any = {};
          
          if (userData) {
            try {
              user = JSON.parse(userData);
            } catch (e) {
              console.error('Error parsing user data:', e);
            }
          }
          
          // Function to save user data
          const saveUserData = (licenseImageUrl: string = user.license_image || '') => {
            const updatedUser = {
              ...user,
              name: formValue.name || user.name || '',
              phone: formValue.phone || user.phone || '',
              country_code: formValue.countryCode || user.country_code || '+966',
              license_image: licenseImageUrl
            };
            localStorage.setItem('user_data', JSON.stringify(updatedUser));
          };
          
          // If license file was uploaded, convert it to base64 for storage
          if (this.licenseFile) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
              const licenseImageUrl = e.target.result;
              saveUserData(licenseImageUrl);
              // Clear pending booking from session after saving
              sessionStorage.removeItem('pending_booking');
              this.modalService.closeModal();
              setTimeout(() => {
                this.modalService.openModal('booking-confirmation');
                this.isLoading = false;
              }, 500);
            };
            reader.onerror = () => {
              console.error('Error reading license file');
              saveUserData(); // Save without license image if read fails
              // Clear pending booking from session after saving
              sessionStorage.removeItem('pending_booking');
              this.modalService.closeModal();
              setTimeout(() => {
                this.modalService.openModal('booking-confirmation');
                this.isLoading = false;
              }, 500);
            };
            reader.readAsDataURL(this.licenseFile);
          } else {
            saveUserData(); // Save without license image if no file
            // Clear pending booking from session
            sessionStorage.removeItem('pending_booking');
            
            // Close booking modal
            this.modalService.closeModal();
            
            // Show confirmation
            setTimeout(() => {
              this.modalService.openModal('booking-confirmation');
              this.isLoading = false;
            }, 500);
          }
        } else {
          
          this.isLoading = false;
          this.toastr.error(response.message || 'حدث خطأ أثناء إنشاء الحجز', 'خطأ');
          // Keep booking data in session for retry
        }
      },
      error: (error) => {
        console.error('Booking Error:', error);
        this.isLoading = false;
        const errorMessage = error.error?.message || error.message || 'حدث خطأ أثناء إنشاء الحجز';
        this.toastr.error(errorMessage, 'خطأ');
        // Keep booking data in session for retry
      }
    });
  }

  /**
   * Complete booking after successful payment (kept for backward compatibility)
   */
  completeBookingAfterPayment(bookingData: any) {
    this.isLoading = true;
    this.toastr.success('تم الدفع بنجاح! جاري إكمال الحجز...', 'نجح');
    
    // Clear pending booking from session
    sessionStorage.removeItem('pending_booking');
    
    // Close booking modal
    this.modalService.closeModal();
    
    // Show confirmation
    setTimeout(() => {
      this.modalService.openModal('booking-confirmation');
      this.isLoading = false;
    }, 500);
  }

  /**
   * Generate UUID for booking
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16).toUpperCase();
    });
  }

  convertTimeTo24Hour(time: string): string {
    if (!time || !time.trim()) {
      return '09:00';
    }

    const parts = time.trim().split(' ');
    if (parts.length < 2) {
      return '09:00';
    }

    const timePart = parts[0];
    const period = parts[1];

    if (!timePart || !period) {
      return '09:00';
    }

    const [hours, minutes] = timePart.split(':');
    if (!hours || !minutes) {
      return '09:00';
    }

    let hour24 = parseInt(hours, 10);
    const min = minutes || '00';

    if (isNaN(hour24)) {
      return '09:00';
    }

    if (period === 'م' && hour24 !== 12) {
      hour24 += 12;
    } else if (period === 'ص' && hour24 === 12) {
      hour24 = 0;
    }

    // Return format HH:mm (without seconds)
    return `${String(hour24).padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  getCarPrice(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 0;
    }
    
    const carDetail = this.selectedCar.details[0];
    const periodType = this.getCurrentPeriodType();
    
    // Get price based on period type
    if (periodType === 'monthly' || periodType === 'شهري') {
      return this.getMonthlyPrice();
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return this.getWeeklyPrice();
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return this.getYearlyPrice();
    }
    
    // For daily, get price from period
    const dailyPrice = this.getDailyPrice();
    return dailyPrice > 0 ? dailyPrice : carDetail.price_per_day;
  }

  getCurrentPeriodType(): string {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 'daily';
    }
    
    const carDetail = this.selectedCar.details[0];
    if (!carDetail.periods || !Array.isArray(carDetail.periods)) {
      return 'daily';
    }
    
    // Find the period that matches bookingType
    const period = carDetail.periods.find((p: any) => {
      if (this.bookingType === 'monthly') {
        return p?.type === 'monthly' || p?.type === 'شهري' || p?.period_type === 'monthly';
      }
      // For daily, check if there's a daily period, otherwise return first period type
      return p?.type === 'daily' || p?.type === 'يومي' || p?.period_type === 'daily';
    });
    
    if (period) {
      return period.type || period.period_type || 'daily';
    }
    
    // If no matching period, return first period type or default to daily
    if (carDetail.periods.length > 0) {
      return carDetail.periods[0].type || carDetail.periods[0].period_type || 'daily';
    }
    
    return 'daily';
  }

  getCarPickupTime(): string {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 'استلام خلال ساعة';
    }
    const carDetail = this.selectedCar.details[0];
    if (carDetail.office?.quick_policy) {
      return carDetail.office.quick_policy.pickup_within_hour_text || 'استلام خلال ساعة';
    }
    return 'استلام خلال ساعة';
  }

  getCarKilometers(): string {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return '200 كم / يومياً';
    }
    const carDetail = this.selectedCar.details[0];
    if (carDetail.office?.quick_policy) {
      return carDetail.office.quick_policy.km_limit_text || '200 كم / يومياً';
    }
    return '200 كم / يومياً';
  }

  getCarDeductibleText(): string {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return '';
    }
    const carDetail = this.selectedCar.details[0];
    if (carDetail.office?.quick_policy) {
      return carDetail.office.quick_policy.deductible_text || '';
    }
    return '';
  }

  hasRoadAssistance(): boolean {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return false;
    }
    const carDetail = this.selectedCar.details[0];
    // Check if road assistance is in additional_services
    if (carDetail.office?.additional_services && Array.isArray(carDetail.office.additional_services)) {
      return carDetail.office.additional_services.some((service: any) => 
        service.name?.toLowerCase().includes('مساعدة') || 
        service.name?.toLowerCase().includes('road') ||
        service.name?.toLowerCase().includes('assistance')
      );
    }
    return false;
  }

  getPeriodLabel(): string {
    const periodType = this.getCurrentPeriodType();
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      return 'الشهر';
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return 'للأسبوع';
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return 'للسنة';
    }
    
    return 'اليوم';
  }

  getPeriodDaysLabel(): string {
    const periodType = this.getCurrentPeriodType();
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      return 'شهور';
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return 'أسابيع';
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return 'سنوات';
    }
    
    return 'ايام';
  }

  // Get additional services from selected car
  getAdditionalServices(): any[] {
    const services: any[] = [];
    
    // Get delivery fee from API or local variable
    const deliveryFeeValue = this.priceData?.price_breakdown?.delivery_fees ?? this.deliveryFee ?? 0;
    
    // Add fixed delivery service first (always present)
    const fixedDeliveryService = {
      id: -1, // Special ID for fixed service
      name: 'توصيل السيارة إلى مكانك',
      description: 'توصيل السيارة إلى مكانك',
      period_type: 'yearly',
      price: deliveryFeeValue, // Price from delivery fees
      price_per_day: 0,
      discount: 0,
      status: 'active',
      image_url: '',
      isFixed: true // Mark as fixed service
    };
    services.push(fixedDeliveryService);
    
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return services;
    }
    
    const carDetail = this.selectedCar.details[0];
    if (carDetail.office && carDetail.office.additional_services) {
      const apiServices = carDetail.office.additional_services.filter((service: any) => service.status === 'active');
      
      // Filter out delivery services from API (we already have the fixed one)
      const otherServices = apiServices.filter((s: any) => 
        !s.name?.includes('توصيل') && 
        !s.name?.includes('delivery') &&
        !s.name?.includes('توصيل السيارة')
      );
      
      services.push(...otherServices);
    }
    
    return services;
  }

  // Check if service is delivery service (should be always selected and not counted)
  isDeliveryService(service: any): boolean {
    return service.isFixed === true || // Fixed delivery service
           service.id === -1 || // Fixed service ID
           service.name?.includes('توصيل') || 
           service.name?.includes('delivery') ||
           service.name?.includes('توصيل السيارة');
  }

  // Toggle service selection
  toggleService(serviceId: number) {
    const services = this.getAdditionalServices();
    const service = services.find((s: any) => s.id === serviceId);
    
    // Don't allow unselecting delivery service
    if (service && this.isDeliveryService(service)) {
      return;
    }
    
    const index = this.selectedAdditionalServices.indexOf(serviceId);
    if (index > -1) {
      this.selectedAdditionalServices.splice(index, 1);
    } else {
      this.selectedAdditionalServices.push(serviceId);
    }
    // Recalculate price when services change
    this.calculatePriceFromAPI();
    // Reload payment methods when total changes (cash on delivery visibility depends on total > 1000)
    this.loadPaymentMethods();
  }

  // Check if service is selected
  isServiceSelected(serviceId: number): boolean {
    const services = this.getAdditionalServices();
    const service = services.find((s: any) => s.id === serviceId);
    
    // Delivery service is always selected
    if (service && this.isDeliveryService(service)) {
      return true;
    }
    
    return this.selectedAdditionalServices.indexOf(serviceId) > -1;
  }

  // Get actual number of days based on booking type
  getActualDays(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return this.totalDays;
    }
    
    const carDetail = this.selectedCar.details[0];
    const periodType = this.getCurrentPeriodType();
    
    // For daily booking, totalDays is already the actual days
    if (periodType === 'daily' || periodType === 'يومي') {
      return this.totalDays;
    }
    
    // For monthly/weekly/yearly, get days from period
    if (carDetail.periods && Array.isArray(carDetail.periods)) {
      const period = carDetail.periods.find((p: any) => {
        if (periodType === 'monthly' || periodType === 'شهري') {
          return p?.type === 'monthly' || p?.type === 'شهري' || p?.period_type === 'monthly';
        } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
          return p?.type === 'weekly' || p?.type === 'أسبوعي' || p?.period_type === 'weekly';
        } else if (periodType === 'yearly' || periodType === 'سنوي') {
          return p?.type === 'yearly' || p?.type === 'سنوي' || p?.period_type === 'yearly';
        }
        return false;
      });
      
      if (period && period.days) {
        // Multiply period days by totalDays (e.g., 1 month = 30 days, 2 months = 60 days)
        return period.days * this.totalDays;
      }
    }
    
    // Fallback: assume 30 days per month if monthly, 7 days per week if weekly
    if (periodType === 'monthly' || periodType === 'شهري') {
      return 30 * this.totalDays;
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return 7 * this.totalDays;
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return 365 * this.totalDays;
    }
    
    return this.totalDays;
  }

  // Calculate total price of selected services
  getSelectedServicesTotal(): number {
    const services = this.getAdditionalServices();
    let total = 0;
    const actualDays = this.getActualDays(); // Get actual number of days
    
    this.selectedAdditionalServices.forEach(serviceId => {
      const service = services.find((s: any) => s.id === serviceId);
      if (service) {
        // Don't count delivery service - it's already included in delivery fees
        if (this.isDeliveryService(service)) {
          return;
        }
        
        const servicePrice = service.price || 0;
        const periodType = service.period_type;
        
        // Daily service: price per day * actual days
        if (periodType === 'daily' || periodType === 'يومي') {
          total += servicePrice * actualDays;
        } else {
          // One-time service (yearly, monthly, etc.): just add the price once
          total += servicePrice;
        }
      }
    });
    
    return this.formatToOneDecimal(total);
  }

  // Get service price display
  getServicePriceDisplay(service: any): string {
    if (service.period_type === 'daily') {
      return `${service.price || 0} ر.س / يوم`;
    } else {
      return `${service.price || 0} ر.س`;
    }
  }

  // Calculate total tax including services tax
  getTotalTax(): number {
    const servicesTotal = this.getSelectedServicesTotal();
    
    if (this.priceData && this.priceData.price_breakdown) {
      const breakdown = this.priceData.price_breakdown;
      const basePrice = breakdown.base_price || 0;
      const baseTax = breakdown.tax || 0;
      
      // Calculate tax rate from API
      let taxRate = 0;
      if (basePrice > 0 && baseTax > 0) {
        taxRate = baseTax / basePrice;
      }
      
      // Calculate tax on services
      const servicesTax = servicesTotal * taxRate;
      return this.formatToOneDecimal(baseTax + servicesTax);
    }
    
    // Fallback calculation
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return this.taxAmount;
    }
    
    const periodType = this.getCurrentPeriodType();
    let price = 0;
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      price = this.getMonthlyPrice();
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      price = this.getWeeklyPrice();
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      price = this.getYearlyPrice();
    } else {
      // For daily, get price from period
      const dailyPrice = this.getDailyPrice();
      price = dailyPrice > 0 ? dailyPrice : this.selectedCar.details[0].price_per_day;
    }
    
    const subtotal = price * this.totalDays;
    const baseTax = this.priceData?.price_breakdown?.tax ?? this.taxAmount;
    
    // Calculate tax rate and apply to services
    let taxRate = 0;
    if (subtotal > 0 && baseTax > 0) {
      taxRate = baseTax / subtotal;
    }
    const servicesTax = servicesTotal * taxRate;
    
    return this.formatToOneDecimal(baseTax + servicesTax);
  }

  getPeriodInputLabel(): string {
    const periodType = this.getCurrentPeriodType();
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      return 'عدد شهور الحجز';
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return 'عدد أسابيع الحجز';
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return 'عدد سنوات الحجز';
    }
    
    return 'عدد ايام الحجز';
  }

  private getWeeklyPrice(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) return 0;
    const periods = this.selectedCar.details[0].periods;
    if (!periods || !Array.isArray(periods)) return 0;
    const weeklyPeriod = periods.find((p: any) =>
      p?.type === 'weekly' || p?.type === 'أسبوعي' || p?.period_type === 'weekly'
    );
    if (!weeklyPeriod) return 0;
    
    // Price is directly in 'price' field according to API response
    const price = weeklyPeriod.price ?? weeklyPeriod.price_per_week ?? weeklyPeriod.amount ?? 0;
    return typeof price === 'number' ? price : Number(price) || 0;
  }

  private getYearlyPrice(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) return 0;
    const periods = this.selectedCar.details[0].periods;
    if (!periods || !Array.isArray(periods)) return 0;
    const yearlyPeriod = periods.find((p: any) =>
      p?.type === 'yearly' || p?.type === 'سنوي' || p?.period_type === 'yearly'
    );
    if (!yearlyPeriod) return 0;
    
    // Price is directly in 'price' field according to API response
    const price = yearlyPeriod.price ?? yearlyPeriod.price_per_year ?? yearlyPeriod.amount ?? 0;
    return typeof price === 'number' ? price : Number(price) || 0;
  }


  /**
   * Toggle conditions accordion
   */
  toggleConditions() {
    this.showConditions = !this.showConditions;
  }

  /**
   * Handle date change from date picker
   */
  onDateChange(event: any) {
    const selectedDateValue = event.target.value;
    if (selectedDateValue) {
      // Find matching date in availableDates
      const matchingDate = this.availableDates.find(d => d.value === selectedDateValue);
      if (matchingDate) {
        this.selectDate(selectedDateValue);
      } else {
        // If date is valid but not in availableDates, still set it
        this.selectedDate = selectedDateValue;
      }
    }
  }

  /**
   * Get minimum date for date picker (today)
   */
  getMinDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /**
   * Get maximum date for date picker (30 days from today)
   */
  getMaxDate(): string {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split('T')[0];
  }

  getDailyPeriodId(): number | null {
    
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      
      return null;
    }
 
    const carDetail = this.selectedCar.details[0];
  
    
    if (carDetail.periods && Array.isArray(carDetail.periods)) {
      
      // Find daily period
      const dailyPeriod = carDetail.periods.find((p: any) =>
        p.type === 'daily' || p.type === 'يومي' || p.period_type === 'daily'
      );
      
      if (dailyPeriod && dailyPeriod.id) {
       
        return dailyPeriod.id;
      }
      // If no daily period found, return first period ID as fallback
      if (carDetail.periods.length > 0 && carDetail.periods[0].id) {
       
        return carDetail.periods[0].id;
      }
    } else {
      
    }

    
    return null;
  }

  getMonthlyPeriodId(): number | null {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return null;
    }

    const carDetail = this.selectedCar.details[0];
    if (carDetail.periods && Array.isArray(carDetail.periods)) {
      const monthlyPeriod = carDetail.periods.find((p: any) =>
        p?.type === 'monthly' || p?.type === 'شهري' || p?.period_type === 'monthly'
      );
      if (monthlyPeriod && monthlyPeriod.id) {
        return monthlyPeriod.id;
      }
    }

    return null;
  }

  private getDailyPrice(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 0;
    }
    const carDetail = this.selectedCar.details[0];
    if (!carDetail.periods || !Array.isArray(carDetail.periods)) return 0;

    const dailyPeriod = carDetail.periods.find((p: any) =>
      p?.type === 'daily' || p?.type === 'يومي' || p?.period_type === 'daily'
    );
    if (!dailyPeriod) return 0;
    
    // Price is directly in 'price' field according to API response
    const price = dailyPeriod.price ?? dailyPeriod.price_per_day ?? dailyPeriod.amount ?? 0;
    return typeof price === 'number' ? price : Number(price) || 0;
  }

  private getMonthlyPrice(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 0;
    }
    const carDetail = this.selectedCar.details[0];
    if (!carDetail.periods || !Array.isArray(carDetail.periods)) return 0;

    const monthlyPeriod = carDetail.periods.find((p: any) =>
      p?.type === 'monthly' || p?.type === 'شهري' || p?.period_type === 'monthly'
    );
    if (!monthlyPeriod) return 0;
    
    // Price is directly in 'price' field according to API response
    const price = monthlyPeriod.price ?? monthlyPeriod.price_per_month ?? monthlyPeriod.amount ?? 0;
    return typeof price === 'number' ? price : Number(price) || 0;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://via.placeholder.com/400x300';
    }
  }

  getPaymentIcon(iconName: string): string {
    const icons: { [key: string]: string } = {
      'visa-mastercard': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/MasterCard_Logo.svg/772px-MasterCard_Logo.svg.png',
      'mada': 'https://www.mada.com.sa/wp-content/uploads/2020/05/mada-logo.png',
      'apple-pay': 'https://developer.apple.com/design/human-interface-guidelines/apple-pay/images/ApplePay_Logo_RGB_041619.svg',
      'tabby': 'https://tabby.ai/images/tabby-logo.svg',
      'tamara': 'https://tamara.co/assets/images/logo.svg'
    };
    return icons[iconName] || 'https://via.placeholder.com/60x40';
  }

  getPaymentIconSVG(iconName: string): SafeHtml {
    const svgIcons: { [key: string]: string } = {
      'visa-mastercard': `<svg width="46" height="21" viewBox="0 0 46 21" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_179_941)">
<path d="M10.9852 13.791H8.93164L10.2161 7.02129H12.2696L10.9852 13.791Z" fill="#1A4393"/>
<path d="M18.4298 7.1869C18.0247 7.04992 17.3822 6.89868 16.5878 6.89868C14.5599 6.89868 13.1318 7.82047 13.123 9.13835C13.1062 10.1107 14.1455 10.6507 14.9228 10.9749C15.7173 11.3062 15.9874 11.5225 15.9874 11.8178C15.9793 12.2713 15.3454 12.4803 14.7541 12.4803C13.9342 12.4803 13.4949 12.3726 12.8273 12.1202L12.5569 12.0121L12.2695 13.5317C12.7512 13.7188 13.6386 13.8848 14.5599 13.892C16.7146 13.892 18.1175 12.9845 18.1341 11.5801C18.1423 10.8094 17.5935 10.2189 16.4103 9.73641C15.692 9.42666 15.2522 9.2178 15.2522 8.90087C15.2606 8.61275 15.6242 8.31764 16.435 8.31764C17.1026 8.30319 17.5931 8.43997 17.9647 8.57686L18.1505 8.64874L18.4298 7.1869Z" fill="#1A4393"/>
<path d="M21.1597 11.3928C21.3288 11.0038 21.9796 9.49863 21.9796 9.49863C21.971 9.51309 22.1483 9.10254 22.2498 8.85051L22.3933 9.43383C22.3933 9.43383 22.7822 11.0543 22.8666 11.3928C22.5457 11.3928 21.5653 11.3928 21.1597 11.3928ZM23.6946 7.02129H22.1061C21.6163 7.02129 21.2441 7.14362 21.0328 7.58298L17.9824 13.7909H20.1372C20.1372 13.7909 20.4919 12.9554 20.5682 12.7754C20.8046 12.7754 22.9007 12.7754 23.2048 12.7754C23.2638 13.0131 23.4499 13.7909 23.4499 13.7909H25.3513L23.6946 7.02129Z" fill="#1A4393"/>
<path d="M7.21664 7.02129L5.20549 11.6376L4.98572 10.7014C4.6139 9.62106 3.4478 8.44734 2.14648 7.86373L3.98863 13.7839H6.16025L9.38815 7.02129H7.21664Z" fill="#1A4393"/>
<path d="M3.33784 7.02129H0.0338016L0 7.15807C2.57736 7.71986 4.28429 9.07402 4.98559 10.7016L4.26733 7.59035C4.14908 7.15798 3.78569 7.03555 3.33784 7.02129Z" fill="#FFC73A"/>
</g>
<path d="M39.4122 6.30926H34.915V14.4813H39.4122V6.30926Z" fill="#DBA32A"/>
<path d="M35.2008 10.3953C35.2008 8.73494 35.9718 7.26225 37.1568 6.30933C36.2859 5.61629 35.1866 5.19758 33.9873 5.19758C31.1462 5.19758 28.8477 7.52213 28.8477 10.3953C28.8477 13.2685 31.1462 15.5931 33.9873 15.5931C35.1866 15.5931 36.2859 15.1744 37.1568 14.4813C35.9718 13.5429 35.2008 12.0557 35.2008 10.3953Z" fill="#DB2719"/>
<path d="M45.48 10.3954C45.48 13.2686 43.1814 15.5931 40.3403 15.5931C39.1411 15.5931 38.0418 15.1744 37.1709 14.4814C38.3701 13.5284 39.1268 12.0557 39.1268 10.3954C39.1268 8.73496 38.3559 7.26226 37.1709 6.30934C38.0418 5.61631 39.1411 5.1976 40.3403 5.1976C43.1814 5.1976 45.48 7.53659 45.48 10.3954Z" fill="#FFC73A"/>
<defs>
<clipPath id="clip0_179_941">
<rect width="25.3509" height="6.99334" fill="white" transform="translate(0 6.89872)"/>
</clipPath>
</defs>
</svg>
`,
      'mada': `<svg width="29" height="12" viewBox="0 0 29 12" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="28.154" height="11.9441" fill="url(#pattern0_179_958)"/>
<defs>
<pattern id="pattern0_179_958" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_179_958" transform="matrix(0.00757576 0 0 0.0178571 -0.287879 -1.33929)"/>
</pattern>
<image id="image0_179_958" width="220" height="220" preserveAspectRatio="none" xlink:href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAADcCAYAAAAbWs+BAABbPUlEQVR4Xu1dB4BUxfl/vW7f63fAcRy9KqBYUECwt9gSjcbeYotGTfK3m0QjamzYYkuiMfauIDbsKIL0ehxwveze1tfb/5s9joDSruw13tNl93ZfmfnN/Oab+dpgmHu4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAj0MgTwXlaefbY4Q//2Gm5ZJolhDgUgEDgOLww1j5PBxHEyH+DfTJPZjuNYlbecaeyzgPXRiruE6+aGG3TnqxkyYThOUCRJ817/WJyheGAQZ9sWAy/Wsi3asR3acWwSWAbnAs1wwiZxwiBIUidxUscJQnd0S1Wk1ApdM1TLcUwgpdFwx+kuCbu5TdvzOJdw7UFrL88t/csLLMcLAsOwhI1RIYegBcPGCzXDGqCoWqmcloNSOs05puELl5Z4cQYLmYZJGrpOGqZO6LqOY5ZFYrYFZCMcIKeDkaRN04xD0zR62SRFW46JJWK1TSmMICWWYzXBI0osQzfQFNVA4Vgz6VgqRxPL4V6qrmnq+htPlPeyCu5pWULAJVwXADtg9sssRVIiSRAshlFFNsmM021nqqSqgxTd9gPhOIdgOQxnGJLmGIrmKJbmSYp0nGhztenYcHZm2ghyDcMsIJgF7zb6iiQp+BPD4TeSgJuTOE6CiISpJ3xJ0aQQyGNNB0SfBfew4ROwmMQcg8ItBT4rmpRMeHm+maXoRQyG/0ha5kbHMpsN05Arrj8u3QXVd2/RDgRcwrUDrLZTC/76X4bhBZ5iGcYgqEkYww3RFG1MpKkpz5blPIxlvEF/MMCJAmNaDm0AjVTNtFTVkDGbMEBqaRhNayCFdD9L12K2jSSPBHNMmSDIJFAqBVNICZhmAq1wG8c4x3JE4GPQsWyfY9seWMUxFkXwCV0faOM4j5kGB/xkMBJDlGYEBuQgrAaBmZapaaYEhyZrSYpiZK/PHxE83gpMV9dwuP0+bltJU1e1imuPdSVgB/pDey5xCdcOtAb99UUPxvCDdM47NWGaR8ipVBlIrQAuiiTP0CSJO7itKbqSTsm2FNcxQ5N9oVALS1JRmqI3MwS9jsDIKnhkM7xabNsxYe1mwrsF4i0j0XDEL5BlBAFTyYyWBESd7RC2beNwLggvjIC1GjwJfgBWgmqFhn9p+EMAyVdEUvgQB7OGmJY5yDDNnOiGiiKMF1ksEKaCwZBfEDycDdJRNUwnpSiyqaZUweeryvX4PqdV5SNbTq2svOHERDtgcU9tBwIu4XYD1uDZL9IcywkkQYdVEzssmpIPjStmucNx+bTHEyAZnjY0XbMU2cBkCUhjJliv2BD0iStY3FnAONp6hiBgaofBy9FIglSXXnEcIlbWjuEPvYumnww0LOM4OG8acODEAJsVp6maMT2RlItA6voplvVQPCt6ckIeVVctqSUWd9KpBo4iN+b4PQvh/WPHMTbbpiltuv4UPWsF3sdu7BJuJw1e/sCLAYLjcixOODKt6kdapp2rK4bfNhwOgxmiouoxS1Y1TNdMIRyoEAV2I8cQiznC3EARmAYdXmEZSl522YlZJdfe9tWxD7yFG7oF60scXhht49QAh+Qn6Q4xorYxMpbxiCGGo0SYwXoNW6cNzFQJBk8QuNMY8gXep1T9M0JVakjbSa6/4QxXC7q3wO/kPJdwW0Epu+c/BM2QPsLDD41byuUtqjQuVFhcKMmaX0qmbasxpmOKXcuL/hV+wfcFYTvfkbhZT1FYmmEIY921p/Wpjjj5wfdAM0PQmun4LYots2nmANmUj6xPRgZZlFNIeVkvw1OgByLi6ebGxrDgXR4ihCcxyVhqGpa66aZfaZ3od/vspfs84Ybc/yoHigqPRVEHNCajv5bS8fG+orxch2XYVHOExgiqXvQFKwI09wmVUr4iDWMdKC4Sm2462+pPvWbc/W9TYHrwWDxXbvqEWTE9fUxToqUYpHhOTm6YNNJpI1GxOQlr1mWlA4e+TtvEPMswEpV/OFntTzhkuy77LOEGP/BqDsVwtMbwpzbH0rOUeMugvOLcgM/nYaLxiCYpUgNMwVbmiL43ONvaQsFr/TW/lLLdID19/ymPv4crtuNTcXKASpB5aUs/SdWUyTDIFOTl5PK4hRn1jS0psEnUBkXhhwBFP0GYenTVNUf3e2y6om32OcINv/8lCqfZPD2Xv7CyueEXmBbKD3kKOdDWKcktFWnMkuvyivM+9dL4iwRuN2y47tf7rKp87AOv4YZle22MCJkUd1JtJH6oZpHDQrmFhZzHz2mWpEpK4+YiwfuuqFrPYrpSv+LGU3rFurUryJGNe+xThBs++78FJkYelXD0kzQfdQAl+H1akxOXG2IxmsE3FYQ873KO/DZDOelV153pTpW263Hj739FMMGir9O+6bG0flYyrQ0V/Xwe5QNNqJZK0pKxOESzc2mCmmtaRu2aP53W6gTqHjsgsE8QbuiDr+YQBD22KRo9N5ZIjg7kFIiaTdrKxko9VFj4QcgrzCVxaw1B2fE1N57ljtC7IcmE2a8SlkWI4GM9ElzVpm9ubpqeU5BbgmMGk0xEJUbgN4WCeW+wBPPxyquPhGm5e2yPQL8mXNm9rwmUVxiYdrQb6pprJ+Xn5OU5Mi43baqrzwvlr/Bz5AsMpm9YddOvm9xu0X4EDrz75RDMGPITqnHl5ub6caEBeQMckeWb48l4Xrh4VT4TetbrmN98c8nBLe2/e/+8ot8Sbth9bxYbjHB8lRQ5z1ccGJnSZNFsiuq0Tn5R6gv9l7eMj5bf+Kv6/tms3VurqQ+8xhgkU1QhpWZHUrEjvCNH8QEhV29YW1U3MpQ/L4CbD3xx2ZTq7i1V73xavyNc2ex/+xjaO0E2iF+lTPNAlSVKFTnOYoZaGwjnfFxIkU/wtrVxyVWn77PKkGx0xalzXmcUG/dFae+0Tc2xazDVGp9fVGYKihXREk3LBxXmPEpZ0vdfXn3UPq3N7FeEG/r3fxdqBHmOjBMnGxZRmoimwGnQrM7NCS8KcPi/GBymj787K5aNDufesxWB8fe/zio6kavjwtHNscQZkhwbVT663JFT0ZiAO4vzaOFPAsc2fnzpkfukUqVfEK78/n+C6zBTlNDl6+vqq45nCgqD4VChFKlpWjk4lP+UiBvfglKk7oerfukqRLppZJhw9+sBCyNLUoR5A+HFpyhGsiAeaVFEXPx+zKDR97AkvurD8w6Nd1Nxes1j+jzhhj3yQljDuXMaGxpm5QX8RbqusvFkLFqQm/+9n+ZfZx1z+ffXnOXGffVQlzv4vlcGmbQzE7x4TqF5zzBOzKU217doAweVV5cw2IXzzzkQRU/sM0efJtzwOf/OabGJe0lBPERubOaTtdUSy7Iry4tLXhVJ/MPvrz13nxtBe2PPnXb/87SBk+PrUumrapPKRH9haYknfwBrJaI/jgn5zoBQ96Z3z526T0Qk9FnCDX/o2aKNieSjBYOKx8dijQGpqblxUF7RD7kU/wBtmmu//d0FrlKkF7Fvxt+fx3WM8Cdx4uyKSMN5GEeVDygZYiTqU+tG55fcLeD6wncvmB7tRUXOSlH6HOEG/u1hBtLpFG6ubXhu3JGzcpd/+UFJsCS/stAX/MRrUa9RqrHi66vOV7KClnvTTiNw6P3/8kFY++lRI3VuPKmU5+WNZOur6pumjBx2twfX5r51wUwUnNtvjz5FuOLZjwgYSZxYW1NzzojRE/LXLvo2J2fQwCWFOcF3PQ7xIW3bTV9cfr7Zb1urn1Rs+r3PCibFHhxX9OMrNlQdvN9+kzyVNevN8qGDv4TI2LtwAo+8d+7R/TL8p88QbsDfnwxYDH1UkxK51tbkQZxqNwoEs2hATv5DLI5vXnjVRa5ipA8R8qh7n8Ytm/RKBnFcTUPdRUK+b2jCUunigQOXFvHh30Gqiqr3zzuu381U+gThCu97MmCS3C+b9cTFvhLvMDURiQvR9McDxJzrvTST+OaqS/tVbFof4k2nizrzL//gZcs+ZmlN5dX5w8rG034/xVP8kmJauADXter3LzyhXylTej3hSh54ptgi2MPqm5t+zxQFBulKVA6K7CclOn3Diqsv7/eL7E736D5wg1l/foyXSPrwNS3NNzPh4IRwOM8wUqkfysJ5V+GGtmXexb/oN5IOUh323qP4gX8UqRR5eRzX/hQePnCAHm1M5XD+F4tt8U9ejnUdYntv07WrZB/d8lvFY5ufjwrm/UGta/mydv06c1BZybg1jRufJQRmv6OfftPbrhv24pN7rYQbcN8TRQZNnqwKxHUJSxnoNLU0FpeUzQmqxjMrf3t+pBdj6hatgwjMvGMOKxP0xHpNujmixw8eOnoYIXD8Uo/J344p2nfzLvpFn/fD7JWEK7xnjs9wiCujeuJUJ0iMoX1iQxHpfdaXth9fcdn5bihNBzt0X7hs+m0PUTbHTUwJ+B+qY/WHe4M5jG0Qq0bkDjqHtKza9y84oU/bV3vdlLJg9pwApFG9TieIk3NLioswTds0gPc/40+bT7hk6wuU6VwZP7vjGpNU5R99uv3kgGDB5001jfbo0ePLVtfWPoWLnrEnPP++p3NP6Nmre5WEK/jbg6LiML9NmPqFxSMH59euWR4fWFB4P4D/+sorLnFj13q2r3Tr06fdej9jstyEKkm6Axe9k4LFxZwFHkTlwcC5pixtefecE/rk9LLXSLiiu+6jIH/+jEQ6cs7wyaNLams3W6H8otc9qvkfl2zd2td7xcMW3Pl7nTb1xcUe718tWfkxnY6RBOuMrZUij5I0WXzC82+iffT63NFrCEda9sGxeNO5oyaOzF/3zUdE2MPPy7ecB1ZfdZkbv9bnulXXFPiz2661BFtfWOLh/1xXsW5RorHKjDTWjLdY/GqKIEMnvfAO7KnQt45eQbjyex8ckUgnzvf6uBE1m9bKos/zQaFu/zFA43V9C063tF2NwCc3X2MKlvr9yJyce+rXrfvRS+DGquXLj7FY4WKaZgu6+nnZvl+Pr+FGP/J4XkVt5KHS8gEjYvEaqmnzppWjhoy5fPW118azXXn3/n0Hgel33ktJjn1UXaT5hoKy4aXrGmLO4ZMPvIEx01+98avj+kx2sB6VcKPmPO5pTGl/Gz5+/8Hr1q4SLQP7cUL5uEtDAu9ul9R3uNAtJf3s1htMD0l8NKCg6Nm6qurEiBHDgotW/3iTzdL+X7zyTqBbCtEFD+kxCTfm8ce4FlW9k/UGj9u0br03NxBcOCgcuveHyy5a1AX1cm/RTxGYftf9OQrH/Smmar+kAh5PmtA2jQiUXCDg1oo3f3lar48U6TEJB5tO/4rxcDMjLfWBvMLczUUQYkM75qp+2k/canURAjRuRWG715eDPnZZsqWB8BflTKhSYvcrshrqokdk9TY9QrgRs+8JNTQ2nIxrWiAVidbl+bzvCY4z99vLL+vTXgRZbSn35hkE5v/pRsdRpWXg1PwsbhprpM0NRrKxsdyyscNOfOo5X2+HqdsJN/a+e0sdEr++OK+gLNYYkcsKi37w2NhcFsdcZ+Te3lt6SfkW/N//aaSsfJgr+uYkqxs3lOcPoFeuXXmVYjrjjnnyCdjWvPce3Uq4EffcTaZV5XzYjP7oZCLJ2LqxMUgxz5K6vm7BpZe4Kex6bz/pdSX76qab0pyuv1kSDL+jxpItFm4Pa9Li16uW1aunlt1KOBwjppiYfVhClnObmyO1A/MKXyF1c/XXV17Rr4IMe13v7KcF+hpIB+u5B6PNkVU5hfmkI9KTZcq+ZNoTc3ot6bqNcMPu/5sQk9NnB/JzBzRHo9LAkgGfMrb1zve/v7ZP+sT10z7c56pF4XZTbtjzCi+I1SRD+yrqqk8zKLJ8xtOPdlvfbg9o3VKoQbPvZGXM/C3hZaY0xlswluOXiRT94pIbrk+1p7DuuS4CP0Xgiz/d5OCW8r6uyh+uX7vaGFg2qEzGtCsVTSvsjWh1C+Eolh6qsc4ZXGFgQNOGNckcr+91mrRreiMgbpn6HgLf/OEmxYM5rxTn5q+gGZJesW7VNJN0ph/y8L18b6tN1gk3ZPZtoo5ZZ4m5vvLKdSuF/JEj3+FI/Ksl1/7e6G1guOXpuwgQhroxIPDPVlZsbBk9dlSeZlsXwR7uo3tbjbJOOJqiDk7GWw6Lxlt4zDbqA7zw8uprb3CdkntbT+jj5fn6+ptSeDr9Jo3hK1mCwqR0clRaU46f8ve72d5UtawSrvxvt+QpinZCMOAvSFVXJwYNHfEM7zhuioTe1AP6UVk8NK2UFxQ+H6ltiMBut2IiET+awMj9e1MVs0o4iyYPl3R5vCxLmsB6vvZJ+LNLL7/eTW3Xm3pAPyrLJ9f8yeAU7b0c3vs9g5EqheODJFU94+AH7+01HihZI1z5I3/JT+PmSXTA629qbKgbFCx4gScIl2z9qIP3xqpwBJkOcvzseDS2ORgMMzEpPZXi+fGHP/lAjznqb49TVgg3+NG/sJpI/ULj8HFJR7XCeXkLKcP+9PvLXEVJb+yk/alM715xg4Wr6nKP4PkYI+kk4/cOVinsPNPGintDPbNCOBNzfHFL+QUlcgGpvikZ4n1vrbj2ZjfGrTe0+D5QhnlX/0GmMfuxxlhztZjn99ano9Mdjhk87emHejwPSpcTbtiTdzO4lzmDC/pGtdTXOX5v4A2GINywm32go/emKhKOqQwYXPxunRw1vQNyBzersZss28nv6TJ2OeEc0wxZtjUDcxwRgwzxfo/47aprblZ7uqLu8/ctBFiWiuC2vohh6CbFVDGcxEZyHnZMT6PQ5YQjCfxANZ4oSTU1S5zgWUbixLqerqT7/H0PgQ8uvs7GJWV5QcC/mExKJo8TXl1Vj5r+6N25PYlGlxKu/P6b2VQ8PkMkaa/aFK0t9PrnizTlOif3ZAvvw88WSTIdsvFHGcXaHGRFvGpT5WSCwHo0kqBLCQeRfxPSycQImEraQZqrFE3y45VX3urGue3Dnb4nq/7ehb/XuaS6OF8QPnNUFTbstIsZkZ8+64l7eixdepcRbszDt7GKpc2AnJKhVCLRXOALzGUdrF/v19yTncl99t4hANtQJyGjwH+lRHJzYWGhJ5JM/MJ07B7b/qrLCIeT+EDVMSZDgCnOMkyVQNA/LL7iZjewdO/6hXtWlhB445IbHdgQ5mueob9zcExvSieGOgI9dcZTf+uRVAxdQrhRD92KmxQ2K5AXHhJpicgcQy/ELKciSxi6t3URaBcC7155iy7Q1FfNTU1pRuBCLYo0U5JlsV036aKTu4RwlqV7bNw5XJHlEG5bSS/LLVl8ze1u+E0XNZJ7m84jYOvatxzH1IXDYaoh0jTJwhyh83dt/x26hHAcTU/CLbs8nU5Q4WCglnLw2vYXxb3CRSB7CIB92Pby7Pex5qaUV/Tkch5u1mFP3NHtpOsSwlmWPdrWTZ8cS6bCHu8iGifcLYGz13fcO3cAAYFlU16K+jjd2FzrpVlG0vSTHQzr9mllpwk38ZGbPLqu7085BMY4eIOAU2u+v/pO17OkA53CvSR7CLxz1e0qrpk/BBmhlrEwraE5OgRjqW53aO404ViGHavpWpmlG3KQE1cRBrY+e7C5d3YR6DgCpIMpIdH7ha3qDZKmCTZNTj74idu4jt+x/Vd2inAHzLmVUCzrIIcgcsDOEfXz4leEjbkbKLa/HdwrugGBD677qwaO9PN1Td/CegROMq1DYBvjbrXJdYpwhmVwCVma7A8F/Zoix3mKXv3djXf3+h1MuqFt3Uf0UgQohlxH4UQTK/J0Ip0eD76/fYdwNm6LmqMX+nOCEE1rJW3b3tBLcXaL5SKQQYCiSYti8ThDYJYsJcOQ5Mp7xJN3dErwtAfaTj3IZvBZlIcuXrFuqZpfnL8MCq+15+HuuS4C3Y0Aw5BU/oDwAk2Kynke0asq6bN0RWa6qxwdJtwhT90mEDw9lBVo0bBUhWHJxm+vu8s1dndXy7nP6RACFOwRTuC2HBIFS6QIFoTESJKwgx26WQcu6jDhHMcKWIY+gqEo0nGcFMOwbiblDjSAe0n3IvDK+TfZhGmlCkJhFXJY4koylQMxmwO6qxQdJhxBEgXpZDJk6obOUkwMM3HXd7K7Ws19TucQ0Iy4h2HXY7qpGLruI0mi5Mg5/9dhLrSnMB1OqoLj+ADbND2pRDLpEzxbHMtJtufBHT13xL3/HmpS7ADCER2c4MCLDFa/OE7YDiR1wDDcdmwL3kHo2hltKXxtwdfoE5yCPmXe0RcQpwf+4w6GLs2csLVMmfug39E7juHobwLdCL4j4I/Me+YRmAUe5+hlQwpE+A4n4DMBl8ALAwMJeoBt4aSl65QmG7QmNW/8y6UdtlMeddixDOwSg70179WfRWHMmHIUjju2aFkWDY+lSJr20xQdgu9aTNOAjPuUTJGwOZhll3G8kHpr/uvL2trgiANmjofza3XLCuMOTlmWoYECrPGrJQvatdnK0VNmeeYt/Ch95KRpOE2zgwChApqmcAAsRZBUxVsL3ukVDhGEaScpy/kSN+3JBEaIGEEMMBQV2eOyvgNvhwh3yEN/YgDMMoZivJFEIjaooHgxbdJZV5iMuvd5/7qmyAUWwU7AFBnakeehf/vgBZ2sjTCIH5nPmQ6/PZF2/LyVX608RBxt5WfrsfU9k8qwlafbDvjYeiqOkRYQT0HvkCTKsaEcFEbQDAbiH8MpwBaHMuBADiuNqekYLqdWjb7l0QdW/fmK3aZ6P3DCIQfV1FTNqo1UD0bk9uB8i+WYzGdffEgOLx31Gnz38f/Kg2HTJs04uGLTulOrGjePhO9L4YVU3Q1+MRhPSDE/fB6C/oYX6vDlI4eMffzEI46veueT92KH7z/tiE++//jZrb8ZPOOJwqhvFuTm14wrH/+WR/DO/2b5V3uM2j9i0jS+Kdp0hpcSj5r/w4JZcD+UpU0DQFpgTNMmjZ78zcnTj3+Potglr330etb7yvb4/PQzuB6mLUn9lsGJKMtxAx2SHAkCBPlV9k7CAYCiYWhjWZrhcc2oEUl21VeX3pZ1hYnqULSFsyPYooETAliuAJkcfCmWhFbtTI7PNo7trol2/huJ6RgFbQRhViD6CGA4vIBzINMwC6MzchO3bUywdcyONyaSWzYwFkHtMtf9wVOOGFZbvfn8xUsXHWZi+oSAGNwcl2J82lFQR0ADiEfTjYXbl2Zc+cRzK2sqz6lqrBpOYGBhgkSopq0hrdsYIBs6tX7roJEH7ygGLOHx+JoR2dCPcTmFNrxA56NXQNHTkPODwDRbH7W8YtmsoYXDb5064ZC3vlz69S79Y6ftf7h39YZ1d9UnGmd5Pb5czhAxjyjy0ZYWMb+oMNTQ0Egu27By6NrK9VOnHjj1PnjOO+1Hu+uueOmSO83T5vypAjetJpD8ZYZtjwBzQc5RD/8p+uHVd3e8Q+xFETsk4WAeRiuqVgjbUFHQxDB622v24lmdPsUkwHpCciHan1OgOzmYjrOYRALPOxVK2IkMEK1zWIx0GCAdmnWSwAoQdkBDDAldRDiGxAxHwQRR92MEB8HHOy/soYcdRdRt3nzqltqNp5YNHhqs3LShGcimlBUOe9Y0VDoQDNUpskqUlAz8fH3d2gyW0ydOY79buvgUgGE8zKo5n9e7aWjZ8M9CXv8XMLNO6bohmJblFz1CwjRNWtV0P4nTSiiUs3zR1tYoKCj4FMcnJUVRaIbiJqV0euDStUvPzSvInwBCm99Qv+4Rv9+D7Kuf76oBDVMvqU/UzyguGVgGrn5KZeWGCEMwq0qLBsXi8RafZetjyktH5a5bv3ry0tXLLzrlyFOXvDH/9R5VskG7pVVZabRFDhZyWshLkn5Mt9Ggk1Xp2yHCkSQ5GIZwv+04ZtDr20LiWLd4l1gEw2KM4NUYD5ZWYDbHQPEJGPzxzmDUibUyEI5yWIyy0EoPLesoIB0NEo4GHRLTOqfVVYyEz4QKbWmLMmaZO42CB1/UAyqr1v2qrGxo3qbKTZJIeT8aPWz0dd+vXphZR1VFqjL9fUNtK9nQYdpWmWyl9i8rGMZWVq4nph8yffabc9944cRpJ8G6BFPnf/02rF8x7JSZp4pvfPH6TqeFHy54fyWcgl6ZY/LYKdTEURM/WrVuzUslZQMPh9llauW6NTfujnBQwRyfL8zBAhOv3LDWnH7wjFlaWmkkCMLZVLdR3m/4/mcu37jmthFjxg9du3LZUWO0sUeeOuu011//6LWeSw5s247PJ34bwZzp0HkDDkmMgIFhcaelwh5u0KHeBukUQqAX8MiaaoKEayBwolsI55AUicEiwCBBSpDQgSEFE1pQEaAm6fgLJoJWx15khlEwfQRCOUA8DF64jV4g8Wy0rIRygvSzHZhewmeQLrB82PkYF4u1TPN6/Lmg2KAczDSHDxn+XBvZdtWGoF1DuINwI6icnAIVCpFJjvPOgreldz5vJdtJh51AvPHxzsm2s/suWrHQ/GH1oqaCvMLvG+obUh6fV1QdefCBIyeW7aocQCwrmUxympoZ+ARTUWu/Wf6t9NXSrzNroh/XLfnvsCHDl8uyTIj+EF1Ztfl4TVWVbHfu3d3/1d/NBgFuVym6lnYInCdYJg8UbR0SQO2pR4cegLRZsNAU5FRC9rLeKgJHioFuOKBrQfcCcQI9HfV2pBo0aYwGfUWHDySZOnjY8HwD1mwoyygJIoW0oXhQFPS9hZSUaGkJnDPgs470mRSIPmDUzh5XX1c72eP1BpKpFFpDVC5Z98M3eyoWTOmlgJizobGhcT/oLGJzLHraCYcdu1xOpqpgDJIoignCzkXGzEnTm2iWped+PQ8yV+3dEfAFvq1vafiN3+fj6uuwAsvC0BqwcmdXQ0ZjluU5khd4VGPNMkykgNhh2kESRBqIiXEch6/ftGpkSSgv62v+PdUUptt1qqGlWAcUJzgOLwyVO6ua1A4RTjWMIocnGN004xRPNX12+R1ZXWi2AQf9GA6kzUePQ4M7Ui6C9ADSIN1zRknR7ne09tpqOGjnO8wkW9ePyJMU5IkFbCOhkGAugO+3GhdAoaLBZ5xG80+bd5idK00omkLb4zoNDbVqji+/IZJs3FN/wUiKbgZlzcq0FBnh9+Xo6zduGK7J6iMJOYbivOq9rF9Ja2mWo3i1IK+gZfqBs17kWfr1D774YI8DJEVRUTArQKijjkYkWAs6u0ygalkOzrKsbRgGQiQKDYG2h8ooZdAxdb+pXNrSko6OZHdmMhQ2zYwA7tHDtMxmy7YTNnQiWO8W0DiW9VCddhNuyv3XkylTz8MojgIJo5IE1dJdqIFFDBSkuonD4OlkFBMsyhGGdIStRWhTVrbrveMSDsQrhiFrCGI5Dh0INJIQ/d76GU130a1xpNQxMJWBPs5jPpyjf5YT8YCpR1NV69fYJFoCwlmCAGu9vbBqfvj5XGPWobOu2bhxy8bK+opjoACHbm0LJF2YlJYIUzif1i2zEDa2GAZW3vzhpcPQXPffe2ozWCakFVkzQMFiwPrQBBPjLqcRhmFhyXjMYQUBnVMAcOywxMDBLAAtZ0ZbYhYQk2Qo7zqQvmE4t0czA0CdEjDQpUkwn2qKGgSXqd5HOJjRgTbVDIClF5YjlAwc2DaS7akRO/s7WJ1tzDYtytExAxEO/kXTyo6TrZMlQkTLcAT619aPNEwrbWSMz6goERGBaIh0iIS4SWbUmT85vv9ynhkMFJCC6KV53mOYhoFsZ3t1fPTVR/bRU499pqQw/znDMAuhHHnQNDBDwjUwggu6aQyNK6kzaxpqD2xobhhtGtZ5R0458ov5C+dv3t0DwJxBmbZUUltXizqhBDDv0sEXjOvQByxHFEUbEpESX6/+boecNqquitV1daNgOknGWmKp/FDuRrBVdttAvet64joY5pOwFsbkeIrnGbYXEg60AJZlsjBxgmUckYQAvr0Yi/eq7+zxJJiZgQgxDVC0g6odOrGDpAt6dUJKZZxGOno9DOiZma2NMbABGQufIXwfDrBjwVQTrdt0CIGnoKy0oWOKZqQczdypSpVhGA0GMtzn9wnJWNI3bb9pOQt+XLBXEmDelx+0eYQgrd82Nea0cYfhC1ctXDBlzIGJ5pbI6ILCwnDVls0FtjWi6JiDjqme++3cXc7r/OGAOWhAeS3MkYeEQ4UJb8CzS1UwBQqHQLiQAEIhUlYdPOHgAWAarUG46qClTan6r23CGceQpGFpaTXkHfYhTEP32N7ZPgEN1TRJSaB0slVFYTGWzXpSoXZPKWHFQ4GgYR3TMEnHTkNn64xOvl2YwpQSJBzoHpCDByJKRkmJGg6tv9EfaEbTnvdWsmzvR9KuAqGToVMR0G0p9AKbHIHWkMgEDt+jZRyaiNFQXrB4Y4pqKw73c7PAwTNOIhqrKquisSaZZmg/pOMexIrC/nD3+e0uz3YXLFj+RaZXg0dQnSzJhj8YgCHAHKBpqvHxok+sow48anI01jIJpwgfA65fjmVBWzoyTpNiLBU/WtHUoty8XCCNHjId86yDxh8cklJpHzjRQDtAnD9F2KzAaes3bfxNMCcUBomK+cMF4XVVm54KeDwbQeFqxZOJ/KZo3YEjx+7vWbNiCSrPjxzLv/X5kvmd0HR1BpX/XQt92YE2Szu6rliOxYMRnJ9537X4x9c/kLXRoN2EI0m8yMOzHsuxVRbHIzSJulj3HATyj0yphKHAYimUC8Mn0lYiniEx0x6itRETLuuMk8rWattIAwk005F2MkM4KBrBYGZGeHIw69WAgDBb0Rwb/Pd+prD45tO37cmTZ3ywsWLFcUWDhojgCTLwo68+venYw0+MAAmW64YFmmuYT4AbCbhyEuDniEPnhoANC5aNFmTutkB/g9w2gfXwiMy4ZDuZJS9GEp7K2trr8wuL8lmGR4OjAleQh4+bitc1N52wovLH89Eik8UZMKs6sBqzwNBBOp6APwgmATvaktBM0zEWr1x5EKxzxoH6B/oMUp+j+TJIdY6zNUv3JnVZAy0lOMrZTiKVmhCTkqOCwSCR1mUqVFBCANnQdG396MH7zf5h9dc9ahJo660wFcZ5DG8wHSuFMYQfY8lSS9G/g9/3qFTqaI9vP+EIXCBxhwZtEyxIsCSEqHebuolCfo8kk2YMStN0i8fSINlYZFBu07S3972jsG13XcbN2cZMpCJFShOQbNApocVA9wWGcExSMR3UFByy03EekyEJpLT42bFo0afzBgwY/Xb1llWXBPKKME8wMGru5/MfY3A6AoMbMq1DD3fAxwCiuTAbVDKwTgOSQWiJnXGVBsMonAFKUmgd3M7wD/lZp4xEbnHhYD8UR964cRVXFB7y1jerv8m4h+VwucjNDEwF4K3sKG2jFmdhBtkSV1ta4o3ILQwZzNv0sQhgRJw2P1UMbG+oPk22ia8GsiqaooCrjVoKJxRGGzK2dlpLxTf7xbxXhg8c8gLYD1CH7hUH0ieDXkDCwU+RZikfydKCQ2R3LGg34WBYBWOLQwLfbIrEwbaCLE/dcwDLQY9np1lDlzmK5NNBD7gFw2Z73SZjd6wn4hgabXAQ8gxoJ0mAAk0lUQQDssxZoNhhQuBbrcvwkjCOFXiOsXaZQ2PUsPLZkBcmsX7TiiPgzmhKOVZzMtbkNjm8bbG5bZRDFvXWCAZ0ZOi/9b3tO622fhM6HYjFfF5aPPDFYQMGEAuWLrDHjRl1F6wbZ8NLByMwiExgqY2WDAhSxFn0RoAhHn0ATgPr4T7I8pHx4EZ/wPcepKCBP1LwPWiQ8QBI33xd00QQmeCLhxuCIGxhSbaO40Rt/rfv91Br/byPQoVg5uCkkVQGMwiFk0QgY+fN4tFuwsEMhoMiZQgnUFT6y6vv7zYARcrWWVVJRDZujAVM2id4QxDxovxc7ZdFwLa/NbLDZfQ1iGjIWwV6KgnCJTO9hZkXajvaEjA5EcWSsSZJMKUUh5G7ND5/+MnbDcdMP+nvpSXFb0Ee/Imwk6w/nUrnQO4YGukdgQ4ZwwF0ENC0o9kbyD4bZoCtEUeZqSTS2gJx0N8oRMmCMJkUzEQT4WDOagHSGH61/LNtkQqf/vB5Nlyr0D23dFMTdOoxH9w4xz7i71fEwQBuQ3IhGFjsMAiUXkY42+AIEic1WGd6Wd8ewzY6hchPLg4wmJUvEquihsaRcrIBZkIiaagSrGUyUrZ1AG61FKBRYOsIvHVAyGhX0LH9ANGm10fKl8yQnTmr9cLWITxz/g5tkDlj61IN3CRx0NjCogeGdVhDwXoK6UwImOtR0M9x0jHBeAJbk5F2PB3EjeUCGON2d8z97G2kcVyGXkceejwxf8N7u5xBzJwyE7EKEQ2WIyiwDx6eCQyEb1ABQcRkhgT4/5vlX3Tb1L8r2zzb97IdC+IFdZMWfCQ0YRAEfUdV1ntV1HZLOOhTPAFBAqomW4Tf263uOfOuOj120pyX/mHSLGcxBK/jFg9jk2FbJBrqM4Ft0NtQl0fdDVEo897Kl5+RcetELCMOWgmWOQld18pD9Nb619bPmfetv2YEGRAKYvGQhxkw0IYoWAekHArUAXlkAd8y9m+c5G2T8rImY+FGGDJG7VXLwEnzv9o12dA9Pl748f8GjF3f1CXabgAHgiVMy7A5Giz7luntdRIOAgQ40Afjhq6iSU63rd/aMHv7yl/F9rbDuue5COwJAZh1y5Zj2KB9B+2vKcK0IKsSrt03tx3kLYG0cWZm1bCnCrm/908Eph94ZKeiEHsNKmghnAnWR7HCJgrzyGrR2k04CJCBNCYx2+tFqSC6woqV1fq5N+9iBI6ZeuKgCcMmn7umYs1zMJN+adqkmSO6+BHdejtwo6QgVyUOEd+ELKfB5PFzO2lXFqjdazg0jYR5LpANlOKZqMvuP5547drM01FKgytOvd9do3RjE8AOt5OWrl90OSx3IbUcuPmZxu3d+PiufxTuQEgnUjxZGPKpzHYsdbsJB5oAC0Xygv0NDE7ZD9jbHuGnX72MMPTkEMquyqFZG/wpbfLRN05BjhMWOAwjJX2r9hAsSEjT0arsyKg+Mn/sqEtpO297vcM2BeRWBedWu1ar9rLtvttl+cpoVdCDM9r4ViMV+JiCAh+9kEUOflEdQMwyaNDucy3XnvcqMib32QNMExDtQBYWlAzwNtRsbgK3r5w+WxkoOHRlDoPegxS7KA06OJhnVYi0n3DgWQKFhDxsJEQz2Fn3rt6+MVW1oSTSsuVcG4+NA5/TsAYuwrbgB2sr0gciV4vMJPengLUSrpV1rexr0/i3EqnV0tn6z3afW5+M3Dd26FA/sdJAEBgK0EPGbnDtAH8r24RVN/I3QfI3Y062CYsB5yhBIk1x2d+fOf656y58b6eBnH2h40KzKzjFEBzPozVcAaR5gACBvnvAqCjg4M0GugkwfhMa9KDeRTiKJDTQ6ICXCXimWqZn5qOXEB9f8Y/srjS3tqeJpQWDSo3gfcRETmSLaNzETN7ATJRIqIPHVqPALq/eo+MBeB/CqJ8JyUHMBDEGLIXpCSiVMk5eYNahwE5tSZasxmMBMVD04ZxnTqu78sLXshpZ3EE49ngZ4EU5lg1+nWAnBr9MGOdQsGnfPXDHA0MqCVYlGwinoKizbFam3RIOCKdC2kVAHEYFIFxrMtSMO1HWD5tQ6aTZEuJET77BxiHCOg1utOB8gexdWwvR3nc099xtjAHIvF39jioM7uat1jt4IZMpivpuM6BnogVQ2RzgFuMXTFMKcKzBabaCwlh2SriZhxyFBlkfzNgLIbhXRDISLIwxWDjXgltUZmSZdeAxOWBWR3FvsGWuAy7cThw6Td3cbz/Y6chz5JRjcCCJH4qCPPpz4I4MBF42mbaxiSRZ++NF83aak2bWQcd5II8uC0VAMZAEI/AS+GGI4AiNZjYZLSV0z585+h4z4+QwTWABtMYzdStkQfZZgiJboD6bYZzW3/7ktV6j3Ybm9cEaDkYPNIpQKgr+yGZHbjfhYF2pQo9A00oSgPSAKM5qAXeoPG7iBqnyFge55zgUGQT9GKQcypaFYhaQV1V731tzkOz6OkSaXf2O1DawWswQEkKikSMhAINmtyh13tYsC/AuZBIyk5gEodeUZUsw3fwZMY489PBQfXP8pLWbKo+qqdsCCgk9z+vPTxuqjmbCUklBcfWBE6auBK9t8btVi/dLppsgjQKKvtOpAJtTmxfM+2jGpBlPfPrDpxnvn6MPPBY3LHtMPJU8fP2myklbGrcMcTAV0iTgFgWRewzJSVCqprHDRz90xP4zF3+y5OMd4hoPGnf4lI3VledX1mwcBc8ogFvqOcGBW0SfZwhFs8GMT02GcPi2ZcWB46cdYpjq6B9WLjkOBuNQNFoHAwdv2I6C3GvUkoLyxSMGl79w/LRffPXegje7ZZDeE3mg9QQ0EUGeckA8NAhmtT+3m3AgEVTQD0BWAwvmvZYAa5asFnB7wFBgiuGoJEZD+6EgEZRHBLouAdO3jCsT9PX2vqNus9vrkBTbzX0RvzLaEmAlUp0iP5PMMhEiUzMev/CiIFMXDlnGQMpA0nOIyHSEHWIIj581ldmwoe7cdZs33BjIK/ENLC+nqrZUWSlZsgIQw8bDekklrP3X126alUgkIMDHgNpzkDGQY4uLhvJyWhq0vmH1oSg458jJM16cv+jTBkmWuSWrVt0u2S37AUooHwny6gdSUQYMUZQoMj6WoeVvVn899eAxh546a+K0rz5avCAj6SYMmTzt2+Xf3g4B0ONKy8vpzRVrQIo5QiTWIBJcSZj3ejBD1TLtDh5smUjwQydOy1+8esUfFSV6GPzJC4GcBLz7gGx24aAhMcjmzNTUV4xpbG4qPnTSFHTJF3siQ7Z/P/7B80nIa8pBonoGMJWh7yS3jp9Ze3S7CQfh//XJWEQRSnNo3YbsTOq22JisFbLtxjCaGhwEPSK+ayhrAfIRhldmyrcLSQQ6391KMJhJ7PZ3pGXZreREZEQUAxhQijwyk0sUzSpRJLoOpDMgbA/+UmWM8QiQqFoXr7xk3g6j+3sffakLrDi1fMQYmKJjwsa1K82c3JIluqLGWQfn6rdsOGT8pCm85uH5WHMtxI84azx8aDMMykIsGhkLAaPFhcWDlY21G04tyQ+joNUGzZRVyU6C9LHyQRIu9XDeqoDoXYMyrIFOrrimufqEwcOGDxQhTdw3K7+59ZDRkyEnCmZOLJ/ILa5YevPAoeXjmyPN/s0Vq/XCgtKXLciwTbMQyyBwR0HQ+qRgOIDVVWEceLdlKgzJYKNANpRqHSQsuzIsBmpKc4qXgBYrHonFDk4rqakFJYO5hppNh6+vrKg7+pDjvpr39fs9KuWg5WmLI8IkywuRmoZUbumQrw0QJNnsyO0mHBRGFyDKFyQbpZtqDkmIO43vykahwSQBsV+wdQd05FZpghwYWz2J23y8f/aeGYfBMyazFv75e5sjzy6v36qV3OnvaAq5TWsJBAMrCUpt3ko4NDdBkWto2mlA2Ciat0J4EawXdoYNeKx7G5uaPBDKgg0eMvLHwUXFZyopZQukLcjzeryP1tXVnQo5Q7BwbmHl8CFlF6UT8lKWorF4KvVX2dGvYSH2B7r9KJi1ouQ8GOyhQY8rGzWH4bn7WZZZBcGjzZAOBi0JCYajsXAouHHZuuV/KSkv90jJlBeUPUgK1uAsCanP7RJJlX2KLEmjRky4W6DZf/+w4rua8cMP4GH1F2ms2zCMZkikLEEbhGSmoiLPWpNHH3hDKBTSBFH4XEkrEBunsYalazmh0FNN8ehj9bGmsxnB76SU9ADYMAT1m27LFrAzzNFyAOIW8y0cghUdLGppeoIiyKwqs9o/HUTOlBzXgmIiIeYpDDFx3bZHMqwdIRYLTICQUiETPNi6XNrD0TaI7up9T9fv4XeEYNuLhMEdJTHLvMDpn2pNw+5QKnAR+iWj8jSLCY89ffTPEvIEQiEHpo6YJEkYbAHWBAHU1d8u/dr5bOEnjbAerGiuq4PJhYFFm+toPa1Hl6+BdAWmg0Fa87mQsjsC6npUUAEolWmPr1d8p3t4Yd4Pq7791NTtZggqEFDwAGhgbFXVSa/PV+cLhQ0IA4OzLc6AsKv9h+4P+16nplC8GIR7glhWIj7e+xEiG7rnsnXfK6aq1+mQe6HVyQhPwXOZ46ceh3+68DMn5Au+BRbaeXJKVWAPBHiWo8HKiIcUdMj8YnAcT4gekUmmm3NAedOtJqWdEg76kKbreTAQkTRJarDuhAxeRFYJ1xEJZ7M0HZGQ/cmyOcjehUbGqk522726HAiGgh9hHz271Xi2PdnQ2glpQH72jrIB7Oz7tvNRv9nd77u679bvd1byrVIvExrX9tpaXCTpoNg7WPNmHDoZX1PRgFKjYOl4HOMoloD13rbacSzTHMjJMXxeHwbpsHjorBnvmkVrvnf2GzE5GW2OaP5QAI0okMHhf9cZpsVMHnXwcEVXDmlqaToQnIRSKCcDbF7hjxvSkPyCAr+kArEwk0a3/HHDcqOooLTcF/BxQE74nm4wdX3Z9lUE8iD9AqQBQcpJpwiCkoz3FrYGlUKeUlhOm0c0J6IzY/FYCXTiiKZrISiTDTlSJo0cO5rfsnkL0nLxcIu2xEd71fbZOCkTYWiaYZJmcI5lDWhR+Z0rn8jqNLfdhAORC+GxWBQS+Vg8y/GweAlkA4yf3vPp907CdasR7ZODNO2tZoCMsgKqAMlgM99kFGc/eUepxXf2fdt5GUeTnVy3q/tt/z3kT2pzBWqN6Nkq6lCEEEwlt2XRQ3wGHwGYzWmQK1WFX3ZQpUN/hA5vUgwnQAYJyCRNkmZmvgzHIaMOIJpScX86nSIjkaZMbkAUA9eGD8wRUbIUlEUNfZcGZ4TMrGXC4AlkQpZ+s7565XWiJ+iX0ilIp2Ag6ZdZcmKJhuTAIcNgBtyaZqw1gg6oB6YeSDMGiV0ZjBM8OpB0B9c5GOg0MPOjGqHTYRNclEACww4bP42taai/Li7HT4gmouW2qaJ+gZ6FBuNijy+smpC5TFVlKCeT2KN9sxs6FaxnPRCyGEab55E8Bdo/lM8wu0e7Cffelf82T/znec20Tek8zTEghvPPfvxi4oXLn8rqyIBydoB4QzFmsMdxa3O3dWiUtKf16Mh7m5Wt/ddDCpFMHhN0QJoXNMndWgY0iG9dnmSs4cAJh4dcR7YKiYzVay6au8NEGLovi4LF0ZQSrdMyOSAhPQFcqX29+nt7ROkIKyccdsC7A2vGuAQkLgX7W+uBzIQ4jhL0IR8bSPTgZDY1wHTLyN9QXXF5XlHJIMj7z+cX5m+gHOrVAbm5r3EC3yIb5tmVdVuugKklPAeyaRKtuVagE6aSyYSTlw+6FtBMQhQtyuK8bQYDxGRQMldUVjg7gbaeRtcZlrHfhupVv+Y9gVLov+zkiYessBRjAUsR63nRo1M8e+qiZT8eC1NYArJ1QzgMiaaUWd+PbXf0oWGLKsYkfQLsEQPTJoU0nKwHVLebcKgCNEY0osWlDplqYcpRCCmFdmnI3V2F2/NbK+FQdvqtCTZQD4O+DibZ3a7jdpJ3dYfHtpq1O3rA3S2UhwdJUdTzWxUzrR6YmcSvWzOMwDmgwYTOiXQWPzMyg4RTDEMnotEoBhteYH7Bi2ae26QgMjyj71vn0WohCKP/7TEHalACuf4g4kMGCpB+xrjS0QRM7gbACmUI/A1Md6Ljho68KhGJz0fTAkPSITsGtkbkBUiCSoIvJPJvy+yMgnk5YVVDtFnmaMang76DYiiwCf6PcDSJCTzNULDbD6qkH8omHThyCi4b8qRwTqHPF/Cz1Vu2NJUXDbwq1tzyLeQtRRCDdssKAZOnh8JhPtIQocEXF9Whxwh31mOXcAZpF1C6I3IEDAAU1oKrkHwmy0f7lSZo3DNhbmdhKQeyjgPgecgbIcvlhGxvSMEPSj5kW4a+hRY86B1JOwI69q5foNFEWs1dvnZ37R5+Q/mVM/satAZOINMEcueCdH4ZDSX6u02pk7HJERQDeSfph/5x4g64I4dwj9eTUWAg5QeMLWjhuU2pAOsrSjcMBtLOAcxkFMi4LS8KSuiEpqNbc/ZDnjpI+YayeRFYsS+Qo4bDYUyV02DBdKJoY1a4uQjOaDIEzW+qqq7GgRBwTzOztTJqQ4HlV2OWVg9l0SBfZUl9LHL9QfsfUj5x1CR88rgpTCg3LNIs7d36vEzelO/WLHRa4tFhwFk+mUpSoN1RwblkIUHRQbAmM6CQwVpaYmWwWQnv8XhgfwHJAwMEstP12AHPh3GDDoG2m4dIfR1y1Edg/6/spuxqHZo7cMB+3ixJpwIef0myun5woSeUddMAsq+akL/YMdmMVMkkPkBLHUhrtrsgoR1XIB2o624ugV4M3RTlTm1VOm71OQEhgpY9rUlhISEzrHhUlMYOdXZfIOANt6QItL9ARp2Ojs+/XeLkhfMciH7AvAKPoS3Bv1z2zbbGh8W96OE5CzTs0F4W2Or+F6VBg6wQOHAmpjO+jUiFK6CkYZDLck0yHvEVFuRZAwcN8m+u3jwn1xf8N8jIKthlZ1KkKna8H8rSmiwZAwJZmfJAlMP6wkDxv9avWj57+KjRBig5psly8nmYCFYrquIhaHIU7xFpSWrlPKx+xIPGTGEhE/ZHP6xaMiMYDIeGDBlctGzlj3OHDSx7RtMkprElMiWaih1dWFiI1dRkFJ5oUbBH/XLXttaOd4OBQk4mUjNzAwG2uq5GKi0c8CF45XZIALWnnB0lnAI+lXWqZQ2Dbu+lOSL/8icvjT9+6ZNZ2ycObWoIhmVw4BQhRMALehsGRnEck8FZ3WlbL7Wn5l1wLoRSgZRF+8K1upNC7iDoSWYmQV5rHKONcQwDnRhcEmGnKhZ2I6ZpTgCZuINZYNbhU7xLlm6wYomYhnxngXzWoeMPFr9a9o00ZdQktra5gY00N+KR5iZEQouGkMltxQfDuKykqQ3r12a0lBRO6YsrV+hjBw/fXOAtuHPd2tV3oIIwDD9y45aKm+Bz2y44RknJoFjFhgp0L5YkaWRXq12yfll0TNnof2m66l23ehU6n2qQ05PhfRSL9j1IG5TV1IDaOQoye5FjkRXfrvxGg6zMP/i54LexWKQcsjzDlgbGeNhi+BnEya1lJZJpSUHZ3tBuPqAVZM4+6Xzzhbef65F4RnD6QRnQ8i3dZMGeGbNUNQ5zi6z137b26hDhQAynIHPOGgg+nAwLZC/4Lo3HdGcL3HTbVKcL+vMOt6AJFhTQpC4l7KotG5roVFIDFzPcpD0kWCaQ2/B2A2arDu9noTaZbzMKl+1H17YcQjs8bgeDQ9svW3U12/YPyTxku5yQGe+uNps3CSMC/C6ndZqn02ncZDWBzquNcUY9jnl2mLqwsLFAXjiwpFVdSthB0bsYtGeZTTRIijL8Pu/XkhbMQyp2gfFuBsLhM/Y/DIcdO3FQ6zs5nsBcgobpm+nEGRqcTOFYsWmdsv+wsf8URa4qrUqHNMab94evOYHi5vk93tWIm0oyPdhQ5f3gewXMads0nysrV8X3H7n/4yV20QKYKh7Z3BIdoxlqqaakW7y8L+bz56zNy83/giHYL4FsGbuV1+uLjh8z5hZZkT+o3FzxqxZdLkHf5wdyqovyC5aD8V6qa2w4sKJm00HIARSWCCVAto1d3U/29n4gMHJw2PxETUlYQBQTkHMalFFM1g3xO9iD9raw6Lxf/fPC0+vjLTdasiyC5uu9AMbf9/jFTzW15x7tPff1uRcENDMCGxdSuCRpm2DPahXSVKMpVmtab5S8sZVVmYx5W//J8GLrs7bSrS00NRMit11mrsz3O/kOTYC2BrJuJW2GuWgrocwOOcgOn1nIZZ6fyS+KlmywUSM4lqRhG0IgEstbOkswTmDzpb956Wc2qGNnzPB/8OmnmXXN9ANmcJ99/+k2A+yh+x8qfrXkK+ngSYeB3ZMyv1j06U5H4oPHT/WBhNS+Xvr5to4zedRketHqRRl1N5DIC0KXXLJuSXx77A8ce/hI0Hyu/WbZpz+b5h0wbooHpl/gCAPhApCkjIIoTWQOpUna/mLJJztVox819Zjwh1/OBQmIYcdMPRYydcOVBK6C1ssPwMRA0Uy//vEbWUsnvjf96qwnLjg6kZIekA21pKg4f76eUG989ep/Z30A6JCEQxViCbIG0ghLYETNUy1zLMkTyKUoq4TjGV8CTAM/wsZ+tsgSiTOPe7pHpiN706DtPaeNbOi67cmG/kZkQ+/f/PDFbr0gvln25bZ1Ydvz28iG/l6yZslOjc2QfnzdFz/M2+ma6vvlC386a9kj5m1kQ8+c++UH22v+wAUHwy487cLOqIbbC+3Pzj/7wXM5WC+PBQWV6KiWzDP0UvCbyrqGEhWkw4QDb9UanmWjtmkMl1U1z/EHh173zysr/n7enKwZD4894kHUKfZqC6dOt8o+dAMgW7cS4JnXnsn6Wml3zQcJ8bzgWDMBZvIe2KciBlb/FZBqNevTSVSmDmtlQP0NfnR4DZpGGbbpAylXBurfrJsH9iEeuFXNEgIUjQcVRSkDwjEcz6ZsXa8Ed8VukXAdJhyIxpQjq5Xg9Q32GsevmcZg8DbI+oZ2WWoD97b7CAJXPnEJ6IeIPFmXwsiQCwH71ZZs1D190eNZdVpug7fDhHvqwucsH02/IcvxSFFpgW9Nxdr9VFN3Jdw+0nH7ajUhrQSvOvqxgTw+r6Z+oxT2ev+NlEHdVZ8OEw4VUFe1tFcUkoouMV6fJ0RwZNmlj12c1QC+7gLGfU7/RACspbxDOsMwxvGBojWlq1IFOCV0m9dLpwgHPn2Q5yK0JhVLyl7RJyqqPhEyCPR4nFP/7CpurboCARBmIVVWB1majXs9ngi4eDU+ddnT3abE6RThaILSPJSwAIIloyzNMslken9wB0FuS+7hItDrEPjd4xfDBkbOQRAeG1bktOzziCvBapo1Z42dAdApwv3ripdMWzKWeRixHvnAJ6OJEnCQHdzrkHYL5CIACKCkVylJOgQcgjLO0wLDfQtePt0m3TplFmhrQVs1o2HRvxhCZTRwvghAlPGYy+ec50o5t4v3KgT+9I8rYBdouzSdTo+gSIr2ebzNkNh8zdOX/rtbzAGd1lK23QCmlQkOoz6F7N4toiAykixNhGjnUK9C2y3MPo8A7AHHQzDZsQRJFaM0jwHRt8xW7cbuBqZTU0pU2Ccvf97QksoyyOtX5REFMpVOlkI0V+7VT57fcS+W7kbBfV6/R8BwdF4xjcNFnvdBqocWRzG/snT7Z65w2Qai04RDBbR1q4al8AUMQ6fBTzUPRpKpkODXlXLZbj33/nuFwI1PXCA4gnOMYmjlEHMPsUj0Bojr+vjpK17s9o1IuoRw/7ruVZUm8M+SyZb6cF7IJ2nyLEogB1z/zwuzHpi6V4i7J+3TCDiE4aVEegqk5ffDDCwhUPTnENHVbba37cHvEsJt1b6sh9wya8C9C2tJxQabtHMQbFaOghrdw0WgxxC47ZmLScpLlqmWfiD0TQ4ijWohYdCHz137ciZ8qLuPLiPcM9e8qvl8/CeReJMUCPsgjUDiWJu0URIO93AR6DEENFvzqaRxRFJOFxngpRwK+Vc6ViZYukeOLiNcZi1nmUsZkWoUfTzdFG0eopPmxCv/cbbredIjTes+FCFg4noomkzMlFXFB5m5Ih6B/QQ0ld3iqLyzFuhSwkEUtFpYmPu5ZEgaSROhWDJ5JKhjA27Tuwj0BAI3PXmOoNHWzJZkvBT2OMB8Ac9GkG7Lnr7m5azFbO6pnl1KuH9d9U6cJ8kFhqVFfWE/l5al8ThF7nfdcxe4JoI9tYT7e5cj4BBWOCmljgHtuR92VYjzLPMR7MDeI8qStsp1KeEyIjwNu2pqzo8ehpUg32KBQdiHaaaOkom6h4tAtyFw13OX8CRLDAGdwhDey+GQRqzS1okFz1z+crebAravdJcT7qlL3qoPkOLjjqJsoFjbE9XjxxEeasjvn72wwwmLuq2V3Af1GwRkXbZXb9rwO28uV9gYq20pyC36D6SdrOrpCnY54VCFYJvctY5hzweGKayHK22S45fCDi6QUts9XASyj8Ad/zgPduXQD/MEvaWQmcsJisH1sBHrSkgv2COmgKxKOHTz5678oIWl2M89nG8zYeBYoiU+mhKJidc+dY4bEZ79/rbPP0E3pZxIsuVCSFiSaytki48MvEWZ5PrHz/tXt0V276oRsiLh0MNwG1/B4NQbZlqLFecW5LQkE1dA6nZXyu3zdMguAHc8cZZHw5UzFFsaJ8sSmecvXsXZ/KfPXPpKVlM47m2tska4xy9+M0ba+HzawVcTkJMs0lI7zmTVX/3+qdPR9kfu4SKQFQRMWhvapDafwfq5QklORwSSex6zqMyGBr3hyBrhUOVM3VwPTs0vtUQaIwMHF4a2NG86jxSc0hue/mW3bVPcG0B2y9A9CNzy+BmhJiNykUppw2GfB4djuKW2YX796KUvdGvM2+5qm1XCPfPbdxWawBZ4RXoJyzomJeKDDa9xgc2YQ7unCdyn7CsI3Pnk2YLJ6TMTdnI66+N9sE1sLezu9DpHsz1qd/sp/lklHHoYTVK1HE2+UVGxITGkvEzcWLvlWJUy97vy0VO37eK5r3QKt57ZQ0C1JF+z0nwe7+cHWQ4h6WlzIez4+tkjl7/ULRmV97ZmWSfcIxe9ZYI6dsWA4gGLYDsgVZG1grgsnYWzeGZ3FfdwEegsAv/3yOlcTI/8PiZH9mMZ3mmpiy4Ncr6H5lz+Zryz9+7q67NOOFRg2Aao2kt7769YVbl5eNlwDFIxjNFw+zdXPXZ6XldXyL3fvoXAzQ+fSeq2OiNU4J9cVFzAr/xxVW1ZeNA9PMn3uJF7Zy3RLYR78Pw3VFN2NuV48t9LR6RGzHR8STl1OuEhjvrdnDPcmLl9iyNdWlsZbG6N6ZaLYE/zodWbquU8Ie9r2H1u+cOXvdHt6RP2pmLdQjhUkIcufKeRx/n7Tclc1NIcM3KLgoNTZuJq2kNMuOGxs9zI8L1pLfecHRD44yNnBFK4cqWQ6x25YtVaJ9GkLA2LeffSBN9rd1jqNsIhpDiaj+SHgrMdU6vgAziVMKJjkkb6HJs0XNucS6Z2IXDLY7/mTVo/IqLXH8sGMLJmS8OmktzBj+A2s+WhK17v1u232lPwbiXcvee+YjIkuWxwadFz6zev0MQ8iovL6VkGjZ/8+zln5Len4O65+y4Ctz9+LmNRxuS4lrqcCTkD11T86AwtGzaP5z3f/eP3O2wA2etA6lbCodrf/etXk4Rhvsvx2Co+BJvSs0ShpOpn2hx23HUPnO6u53pdF+l9BTIwZXBa185MqulRlKAQtq1V+gTvM/+4bn5mh9XefHQ74RAYBEY1lVFlV7Vsia/05nBkiwZTS0s5Fmexgv+bc44bxtObe0wPl+2WOWcUyI58OpgBpjE+h27cGFk9NDDibi/n7fVka+37PXD87ey3ZFvDVw/1lF/SkKisLZnoEZrl5hlRXb5WMWU38VAPtElfeOStc37FKYR6YlWq6pf8MHPgpvrlDaPzJ93CYL71D1/5vt4X6tAjhEPA/O2cd+O2Ym4ekj/w+dq6amlgaZGP5umZOm5ffePDpwf6AnhuGbsPgTsf+zVtYMb0qBQ7q6isqPCHRd8lx5aO+xdmUtUPXzm/oftK0rkn9RjhMqT79bv1Ypp/uVQofVGOJeKGlRhoMPI5Nm9c8adHTsvtXNXcq/sLAnc/+RvaJNUJDVLd9WJQGLFqyXJ7v5IDPhSswAdkLzVw7wr7HiUcKhRl06uZBHY3ZRkLLUfGxDBVJtHKRbYX/+VNj5zqxs/1F9Z0sB4P/vN8xmKV/WvVmru8ReL42oZKemB+0cIAHr6HsMVNf7/s7R7LwNWRKvU44W4/6zWLcegt+aLvFr+fX6IRCkb68dJNibobDNE55qaHTnbXdB1p2X5wzaMvnEdrZGpotdbwF9NrHdiYqudhB9Pleb7cm3GLrbrv0jeVvlbNHiccAuzO37xpUxa9Osx7bsEdfEU8kcC8IWFgREvcSPmIw2595OSCvgasW97OIfD482f7MU4ZW6vW/83mrEkYTXANtQ3rB4RLb3cMpva+S9+SOveEnrm6VxAOVf22c97UzKSzUDSYuyibWldUELRNJz5GZ9U/Uj7njFsfPsklXc/0kW5/6uMvnO11ePmENNFyS1Xz2qmDBobsaE3zxtGDxt5j69SGey99u8eTAXUUlF5DOFSBv57/fppSsHl5DHfrhlUrKwcOzMOqGzdPUVn9dMJL7HfzQyeFOlpR97q+gcBjL55P2ZxeKlHyiRX1G48YUjbIv/ibhYmRRWUPig7/1SNXzqvrGzXZeSl7pZH5pqeP9OK88QuLxf9AcOyoDRVbYE+vwKoiIXwXlSY++us1b/doMs++3OC9uewPPn8epRHSyDql4S/VzRsOHzy4yC/FUw35vsKnbVV8/M8XzO3TZEPY90rCoYLd9MwRhYSIzaxKttwycGj54NraKCW1yJvKvHl3MzL5jkAITX+4/D89nvasN3fgvlS2+/75G1an1P02Jmvu0EjtwLLSXHvZokUt44eM+Q+pc2/fdu6HS/pSfXZV1l41pdy+kH+98JN6Pem8k+sJ39bQENlk4Army6UHN6Yb/2iyxvmqlRb6QwO4dcCw2c+dTaq4NG5jy6a/mJx2ECWS3KJFq2rKikb/xZTYf/QXsvVqCdfWEa9/ambI8eLHQdzTTaqUHu4jwIFO5TbwBvM8pOB7BCJ7pT9e8Yrpdty+icA9z57JqZg6uUFuuIUNcxMb4k1cNBJdO6Jg2M08Jvw4++J5fcaLZG9aoNdOKbcv/I1PzfSTYJNLG+o1mmSMdXSS9lC+zbDN8dwgwz3raET1/13xRmxvKuye0zsQePC5cwnNkgMSoRxXm2y4QAhwo+saamicJFaUBIpup2xx9X2XftivyNYnJFxb97j5mSO9FOMMapFTf5Z1Y2ogHPbHmmOJwkDuFwFGfNFKY185Ftnyx8te6hNOrL2j2/dMKe5/5tesSWiDk2bq1IrkhtOKhhTmL120zBmQW7y0KFh0E25xVXdfMLdPeP+3F8E+IeHaKnXnP48lMUwv0jzW7VuSm88sKirmU5tMJdeTt8LDMC+ZkvOuqRJVt/72VZd07e0J3XT+PU+dLlqEUZ5S5N/UyvXHCKOMgT+uWKvtVzzm1ZCT8xBmc9V3nT8v3U3F6fbH9CnCIXTu/e9JrEMZw3Wvdu6azevPLvAU5aVjBsZSYk3YH/oXodLPOwZZdeulL/c5t59ub/1ufOC9//wNrhlS0CL1kxqiDWeYljlKzKPJxVu+l0cNHPpsEC94m6E9m+88Z26/brc+R7gM6V46kTQtrZQRiPIllV8/MnT04KFyisMa63UpKBZ+F2TEv9hpY/Edl7/VKzM3dWM/7xWPuuvZM3iTtEplTDo3JjcdzYjGABtL4BWrqtbvN+Lg62wdr6ZZofav533Ua3ORdBWQfZJwbZW/7+XjB3IBZ781javuVmRmxIDiEbilM1Iynq70M9RrPpJ5lTSI+uvOfS3eVYC599l7BOa8+GtetbUA7LN9QMxUzpYN+QAHU/yxRK0qCPa6XLp4NmX7vv/rBZ/tM44MfZpwqOnv+u8JebA3Vp5KYZduqa4+1efjC71eBrNtMypQ9NIQ6/8vqTOLLBWvvPLXr/XbtcHe0yD7Zz7+4lmkQ2qlNE9wEpU+bVNz7SkpWSnBcJpsaZHqwsHwlyHB8ySFMevuPvfjPumE3FEU+zzhUMVnv/5LDnPsYkJwDq1vrroeRtExgkhjLc0tWNAXrisO579FqcwzmEnXkRjbdOFpL/T7qUtHO0Rnr3v0v6f4cMoKM0Fi1ubGLRdUN1eXFxUXCk1NMTmVNlcV5ZQ+xhDCF7PP/6S+s8/qi9f3C8K1AX/vq6fl84JdIjup27ZUbTysqDjsB+mHNdVFLIEVVpcXD34UV/nPbYtJ4jjXeOHJz1l9sdF6Y5n/8cqZvI0puaRoljfJjTc0xSP7eXyefF3XsbrahqqiwrJPKId/2DDYmvsu/qzXJmrNNrb9inAIrEff/aWfosx8LoBNXFux/taGptoRpYOLMQpnsMbaSCInVLystKD0LkMhN1gmVXfJSc+p2Qa5v99/zkun5ZGM7ZeIxBWbajfOxEhsOAlb15im43h474/wekSTyR8Igtvw59980qt2s+nutul3hGsDcM47Jw0haXOwRZmnbqmtPU5V5QGFhYUYNLre2NBcl5tTsNJHB243FLzx2tNf7jU7ZHZ3B+jM8x7+76m8ZihBU7Quqm6qORYnsCGCyIYwy7JwgqihCPpHwsKftXRyyd0XfbNPTiF/im+/JRyq6FPzfsXYtpGvE+rEmCRdXN/QtD+4DhX4fLABK+5ITfXRDaVFQz/yMOwnMPNcAlIwedWpL+/TI/CeCPjQS6fjuqH6MNLKA1X/2LXVFZeFC0KjaJILSJJsS6l0s8Bxa/yC8BKDM5+SFNt4y1nz3an7VmD7NeG2Sbv3T+egk3hhh5WpCVn5Lew3PpYTsTyPn8KamuvTJEbW54UK1oTF/Fc5y7sQt2GqecIrvWab2j2RoLt+v+eF44IEZw+TnMTRkVR0RksyOrC4pCQ/2hwn41G9we/NW+HnPf+kHOcLluHSfz3/ExfDnzTOPkG4tjo/8P4pAQc3SjHemZVMRc5siGwelVvCsJF4E6amMMPD5dSVhMtW+kjvuxxEF+MmUX3esa/s08bz2f86nrAw0++wzgjJkY5NGKlZspEYQnNYmKZprG5TfaQwb/BanvI+jRvklzQtNNx1zof92lukMwPcPkW4NqDufvvofIqx9scY84h1NStODeZ4BtIkS+iKiUlxSYH1fuOgguLKHMH3ERDvU0vDooaOgWaTiZ97wmt9Ki1bRzrHnBdPFA1TYUzb4AxSna4S+kFxTZ6o2vZA3ivkkSxJp+SY1FQbXV9eOGyOpeBrbJva8PCl3+yz2se9xXmfJBwC58H5JxO2KYccShtjMsYxLfH0Ycl4oojCnRBD4RxmaqauyEmO5pryQrl1ub68r0mMX6Cr9EZNx9K//cXbvWqz9r1t8F2d98hrvyRMUxYpwvBQnDk0LjWeWVVfNdbC7ULBHwjiNCfIqmmnVT0mer1VIse+jcvkXBoXN91z/pf79CygPdjvs4TbHqTZ7x8pWqbmsR3zAEVNn5RKNY8lKWOQKDI5pmOSto3ZpuFEaZKvC/qKajja8zl4SXztaDho4kgbs/AUbNMgXXbyG30iEPaZt8+gHNxhDNumVdtkbcyBWF4rT7OlGc2RqpmJVENZICgMDAQ9nGFZWCqlSkrarvJ689YTGPOqbZHf2RbV/MCl3/erQac9xOnouS7hfoLcg+8eEcRhg0jdko9pSbbMMBxzqE3gYcshBBvt+0PzBkZQCRwnEo5uNg8vGfAFYTjVmIlvsk2qydCcZseholef8kav0nY+9MppFIQ2+TgOCxKMFbZJq9Ai8cKGePrQlKoVJOJRL4E7eR6RCTMsQZu6bCmSlPR5vZt9vPdLR6ffMTWi0sHZ2B2/+dK1XXaQcS7hdgHc/e/M4k3LYCUIdtUpfD/NwabG5MQQ3VLzGAEXeS+F+TgBi2ysjvlZbyLoC8a8YrAWFC3fYya5FLOINRAQ2wTGX9OxceWGM9/q9oRHf/7XiQxFYSROmF6adUoJ1trfIY2DE+nY0Gg84k+oMY+nyBNySJwxFAxU+gZsXoRFA978xrDo+xLTtQWUQyx1YIvau877vs/mguwgN7JymUu4vYD17neP95mOFdJxa1zKlKenlPQBkpTIxzE9mMfzPEfRDIHTlqk7sqaacdvCojRGNzBggxI5fhnmYPUkQTWRBB4hCAJSQUA+dwy3HIewHXjHCcr4wxlv7/V09M7//IJwYF6HYzZJ4jYQyqbgM+E4NmM7jt+y7BzLsXIt3CmUVWW8jekFmqnmYriRS7FkmGMp8Ot2CIM09C0NW+IOQaW9Qiji5UJLOYyfTzvMetwhm2maTdx++seu3+le9JG9PcUl3N4itfW8m189RoS1nggMCwPTilNy5LcmrpYrkuzTTctDEDhLUQRGko6J4aaRSMUlBzQwYHDXCcKRGJpWKYoySJLWHYtO0Zi3gsDYCEXSCZIgFIIgNXjXSRIycGK45jgQ+OA4pGVbrGXbHtO0RMuxvbZtiRhh+C0qORxn9HxDU2lN00jDsGg4h8VxULviFCPwPg8MAKyl26QJP2A4DmVgUizHJiFQt4LD+edsh6h3MCKK4aTCsaL05zM+2WvytxO+ff50l3Cd6AIPzj2dt00lTPH2IE5kh+EUMcEwtFGxZCQ3noz4FTUlMgIt2piBGw7wyzGAK6YF5zlAKovAOVNOYRrhMBpkCDVxEFMYiCkokgWSECQfbhvg/IvEoAPiEF6k4+BgVwbXUGCUQ+iMJ0gKDgERZ5ZNwa3hcnCqcggcZok4GPAtVdZTLOWVfWIwLojeGgonF9u6swqGg2rbwOsYWojcdMp8d03WiX7QnktdwrUHrd2c+8i8072WbfgI0vFSNBakWaKE4uhBTc2Rg0Dx4pNkiU3LSVZVNUozDAZIA5xy2HCu1+eARgKED2FZJhJnmAXEMU0DMy3LAYkI3AKJSZE4SEaMhpuTJIkRJAFrQlqrrm5OWDaukiRh0iSlMSxr8iynMTSvA/Hi4WDwU03W6k3dboG1ZJQg6BhDc8lbTnnfJVkXtX17buMSrj1otePcR+aeAeEqFnrBEs7iwINedDDHCyIO3jEBCALeT3RI0VMHE6SVbxignrdBHwqHDQwyDIPQ4eXYSGQRiJ02kM6hKNoCwllwmqbrRD1Dej9XFT0G/sIKSEAFd7A05uASXKdiIPpIuDkIQ/XOM97r9wb7djRPj53qEq7HoIfA2XmnsrAeBEWHycNMkgJmov/RtBKVCqaQGJo+kjDd3Kq4gM284DMIQfiPsOAnHaKoVZhpKnec9Eq3a0F7EDr30S4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAi4CLgIuAp1H4P8BBZe56bjgwiUAAAAASUVORK5CYII="/>
</defs>
</svg>
`,
      'apple-pay': `<svg width="28" height="12" viewBox="0 0 28 12" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M5.06592 1.46738C4.74108 1.85178 4.22122 2.15508 3.70141 2.11171C3.63644 1.59196 3.8909 1.03961 4.18873 0.698472C4.51358 0.303243 5.08216 0.0216564 5.54242 0C5.59656 0.541463 5.38535 1.0721 5.06592 1.46738ZM5.53706 2.21463C4.78439 2.17132 4.14006 2.64235 3.78267 2.64235C3.41993 2.64235 2.873 2.23629 2.2774 2.24712C1.50313 2.25795 0.782944 2.69649 0.387661 3.39501C-0.42456 4.79201 0.176512 6.86046 0.961609 7.99753C1.34606 8.56065 1.80632 9.17791 2.41275 9.15625C2.98675 9.1346 3.21414 8.78268 3.90725 8.78268C4.60572 8.78268 4.8061 9.15625 5.41253 9.14543C6.04062 9.1346 6.4359 8.58236 6.82036 8.01919C7.2589 7.38027 7.43762 6.75754 7.44845 6.72506C7.43762 6.71423 6.23558 6.25403 6.22475 4.86781C6.21393 3.70908 7.17233 3.15679 7.21564 3.12431C6.67412 2.32292 5.82947 2.23629 5.53706 2.21463ZM9.88511 0.644331V9.08593H11.1954V6.19989H13.0094C14.6662 6.19989 15.8304 5.06282 15.8304 3.41672C15.8304 1.77068 14.6879 0.644385 13.0527 0.644385L9.88511 0.644331ZM11.1954 1.74897H12.7061C13.8432 1.74897 14.493 2.3554 14.493 3.42208C14.493 4.48877 13.8432 5.10067 12.7007 5.10067H11.1954V1.74897ZM18.2237 9.15084C19.0467 9.15084 19.8102 8.73396 20.1567 8.07333H20.1838V9.08587H21.3967V4.88405C21.3967 3.66577 20.4221 2.88062 18.9221 2.88062C17.5306 2.88062 16.5018 3.6766 16.4639 4.77035H17.6443C17.7418 4.25055 18.2236 3.90941 18.8842 3.90941C19.6856 3.90941 20.1351 4.28303 20.1351 4.97073V5.43634L18.4998 5.5338C16.9783 5.62583 16.1553 6.24856 16.1553 7.33154C16.1553 8.4253 17.0053 9.15084 18.2237 9.15084ZM18.5756 8.14913C17.8772 8.14913 17.4331 7.81345 17.4331 7.299C17.4331 6.76842 17.8609 6.45977 18.6785 6.41104L20.1351 6.319V6.79544C20.1351 7.58601 19.4637 8.14913 18.5756 8.14913M23.0157 11.3817C24.2936 11.3817 24.8946 10.8944 25.4199 9.41618L27.7211 2.96183H26.389L24.8459 7.94875H24.8188L23.2756 2.96183H21.9057L24.1257 9.10753L24.0066 9.48115C23.8063 10.1147 23.4814 10.3583 22.902 10.3583C22.7991 10.3583 22.5988 10.3475 22.5175 10.3367V11.3492C22.5933 11.3709 22.9182 11.3817 23.0157 11.3817" fill="black"/>
</svg>
`,
      'tabby': `<svg width="28" height="12" viewBox="0 0 28 12" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="27.2877" height="11.4432" rx="1.73277" fill="url(#pattern0_179_968)"/>
<defs>
<pattern id="pattern0_179_968" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_179_968" transform="matrix(0.00295776 0 0 0.00729927 -0.611979 -1.29927)"/>
</pattern>
<image id="image0_179_968" width="777" height="523" preserveAspectRatio="none" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>
`,
      'tamara': `<svg width="28" height="9" viewBox="0 0 28 9" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="27.2792" height="8.80533" fill="url(#pattern0_179_973)"/>
<defs>
<pattern id="pattern0_179_973" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_179_973" transform="scale(0.0021097 0.00653595)"/>
</pattern>
<image id="image0_179_973" width="474" height="153" preserveAspectRatio="none" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>
`
    };
    const svg = svgIcons[iconName] || '<svg width="60" height="40" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="60" height="40" rx="4" fill="#E5E7EB"/><text x="30" y="25" font-family="Arial" font-size="10" fill="#6B7280" text-anchor="middle">Payment</text></svg>';
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  onPaymentIconError(event: Event, method: any): void {
    const img = event.target as HTMLImageElement;
    if (img && img.parentElement) {
      // Replace image with SVG icon as fallback
      const svgIcon = this.getPaymentIconSVG(method.icon || 'visa-mastercard');
      // SafeHtml can be converted to string using sanitizer
      this.sanitizer.sanitize(1, svgIcon); // This returns the string value
      img.parentElement.innerHTML = this.sanitizer.sanitize(1, svgIcon) as string;
    }
  }

  getSelectedDateLabel(): string {
    if (!this.selectedDate || this.availableDates.length === 0) {
      return '';
    }
    const selected = this.availableDates.find(d => d.value === this.selectedDate);
    if (selected) {
      const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      return `${days[selected.date.getDay()]} ${selected.date.getDate()} ${months[selected.date.getMonth()]}`;
    }
    return '';
  }

  openMapModal() {
    this.showMapModal = true;
    setTimeout(() => {
      this.initMap();
    }, 100);
  }

  closeMapModal() {
    this.showMapModal = false;
    // Remove listeners and reset map when closing
    if (this.mapCenterListener) {
      (window as any).google.maps.event.removeListener(this.mapCenterListener);
      this.mapCenterListener = null;
    }
    if (this.centerMarker) {
      this.centerMarker.setMap(null);
      this.centerMarker = null;
    }
    if (this.map) {
      this.map = null;
      this.marker = null;
    }
  }

  initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      return;
    }

    // Check if Google Maps is loaded
    if (!(window as any).google || !(window as any).google.maps) {
      // Retry after a short delay
      setTimeout(() => {
        this.initMap();
      }, 200);
      return;
    }

    try {
      // Initialize map centered on Riyadh, Saudi Arabia
      const riyadhCenter = { lat: 24.7136, lng: 46.6753 };
      const initialCenter = this.selectedLocation 
        ? { lat: this.selectedLocation.lat, lng: this.selectedLocation.lng }
        : riyadhCenter;

      this.map = new (window as any).google.maps.Map(mapElement, {
        center: initialCenter,
        zoom: 13,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false, // Disable fullscreen to prevent zoom issues
        language: 'ar',
        mapTypeId: (window as any).google.maps.MapTypeId.ROADMAP,
        gestureHandling: 'greedy', // Allow zoom with gestures
        disableDoubleClickZoom: false
      });

      this.geocoder = new (window as any).google.maps.Geocoder();

      // Create fixed center marker (pin in the center of map)
      this.createCenterMarker();

      // Listen to map center changes (when user drags the map)
      this.mapCenterListener = this.map.addListener('center_changed', () => {
        this.updateLocationFromCenter();
      });

      // Also listen to dragend to update location
      this.map.addListener('dragend', () => {
        this.updateLocationFromCenter();
      });

      // If location already selected, center map on it
      if (this.selectedLocation) {
        this.map.setCenter({ lat: this.selectedLocation.lat, lng: this.selectedLocation.lng });
      }
    } catch (error) {
      console.error('Error initializing map:', error);
      // Show placeholder if map fails to load
      if (mapElement) {
        mapElement.innerHTML = '<div style="width: 100%; height: 100%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; color: #6B7280; direction: rtl;">يرجى إضافة Google Maps API Key في index.html</div>';
      }
    }
  }

  /**
   * Create fixed center marker (pin in the center of map)
   */
  createCenterMarker() {
    const mapElement = document.getElementById('map');
    if (!mapElement || !this.map) return;

    // Create custom overlay for center marker
    const centerMarkerDiv = document.createElement('div');
    centerMarkerDiv.className = 'center-marker-pin';
    centerMarkerDiv.innerHTML = `
      <svg width="30" height="38" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 0C8.954 0 0 8.954 0 20C0 35 20 50 20 50C20 50 40 35 40 20C40 8.954 31.046 0 20 0Z" fill="#EF4444"/>
        <circle cx="20" cy="20" r="8" fill="white"/>
      </svg>
    `;

    // Create overlay
    this.centerMarker = new (window as any).google.maps.OverlayView();
    this.centerMarker.onAdd = () => {
      const panes = this.centerMarker.getPanes();
      if (panes && panes.overlayMouseTarget) {
        panes.overlayMouseTarget.appendChild(centerMarkerDiv);
      }
    };
    this.centerMarker.onRemove = () => {
      if (centerMarkerDiv.parentElement) {
        centerMarkerDiv.parentElement.removeChild(centerMarkerDiv);
      }
    };
    this.centerMarker.draw = () => {
      const projection = this.centerMarker.getProjection();
      if (projection) {
        const center = this.map.getCenter();
        const point = projection.fromLatLngToDivPixel(center);
        if (point) {
          centerMarkerDiv.style.left = (point.x - 20) + 'px';
          centerMarkerDiv.style.top = (point.y - 50) + 'px';
        }
      }
    };
    this.centerMarker.setMap(this.map);
  }

  /**
   * Update location from map center (when user drags the map)
   */
  updateLocationFromCenter() {
    if (!this.map || !this.geocoder) return;

    const center = this.map.getCenter();
    const lat = center.lat();
    const lng = center.lng();

        // Reverse geocode to get address
        this.geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
          if (status === 'OK' && results[0]) {
            this.selectedLocation = {
              address: results[0].formatted_address,
              lat: lat,
              lng: lng
            };
      }
    });
  }

  /**
   * Get current location and set it
   */
  getCurrentLocation() {
    if (!navigator.geolocation) {
      this.toastr.error('المتصفح لا يدعم تحديد الموقع', 'خطأ');
      return;
    }

    this.isLoading = true;
    this.toastr.info('جاري تحديد موقعك الحالي...', 'معلومة');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Reverse geocode to get address
        if (this.geocoder) {
          this.geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
            this.isLoading = false;
                if (status === 'OK' && results[0]) {
                  this.selectedLocation = {
                    address: results[0].formatted_address,
                lat: lat,
                lng: lng
              };

              // Center map on current location
              if (this.map) {
                this.map.setCenter({ lat, lng });
                this.map.setZoom(15);
              }

              // Update form and close modal
              this.bookingForm.patchValue({
                address: this.selectedLocation.address
              });
              
              this.toastr.success('تم تحديد موقعك بنجاح', 'نجح');
              setTimeout(() => {
                this.closeMapModal();
              }, 500);
            } else {
              this.toastr.error('لم يتم العثور على عنوان للموقع', 'خطأ');
            }
          });
        } else {
          this.isLoading = false;
          this.toastr.error('خطأ في الخريطة', 'خطأ');
        }
      },
      (error) => {
        this.isLoading = false;
        console.error('Geolocation error:', error);
        this.toastr.error('فشل تحديد الموقع. يرجى التحقق من إعدادات الموقع', 'خطأ');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  searchLocation() {
    if (!this.geocoder || !this.mapSearchQuery.trim()) {
      return;
    }

    this.geocoder.geocode({ address: this.mapSearchQuery + ', Saudi Arabia' }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();

        this.selectedLocation = {
          address: results[0].formatted_address,
          lat: lat,
          lng: lng
        };

        // Center map on location (center marker will follow)
        if (this.map) {
        this.map.setCenter({ lat, lng });
        this.map.setZoom(15);
        }
      } else {
        this.toastr.error('لم يتم العثور على الموقع', 'خطأ');
      }
    });
  }

  confirmLocation() {
    if (this.selectedLocation) {
      this.bookingForm.patchValue({
        address: this.selectedLocation.address
      });
      this.closeMapModal();
    } else {
      this.toastr.warning('يرجى اختيار موقع من الخريطة', 'تحذير');
    }
  }

  getMapImageUrl(): string {
    if (this.selectedLocation) {
      const lat = this.selectedLocation.lat;
      const lng = this.selectedLocation.lng;
      // Using Google Static Maps API
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&markers=color:red%7C${lat},${lng}&language=ar&region=SA&key=AIzaSyBAn_b3jCbl3agJl7CM7WYIHjGWJIExwfQ`;
    }
    return '';
  }

  getMapIframeUrl(): string {
    if (this.selectedLocation) {
      const lat = this.selectedLocation.lat;
      const lng = this.selectedLocation.lng;
      // Using OpenStreetMap embed
      return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}&layer=mapnik&marker=${lat},${lng}`;
    }
    return '';
  }

  onMapImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://via.placeholder.com/400x200?text=Map';
    }
  }

  private scrollToFirstInvalidField(): void {
    const firstInvalidField = document.querySelector('.form-input.ng-invalid, .phone-input.ng-invalid');
    if (firstInvalidField) {
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Also focus the field to highlight it
      (firstInvalidField as HTMLElement).focus();
    } else if (!this.selectedLocation) {
      // If location is missing, scroll to location section
      const locationSection = document.querySelector('.location-container, .select-location-btn');
      if (locationSection) {
        locationSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.selectedDate) {
      // If date is missing, scroll to date section
      const dateSection = document.querySelector('.date-selector');
      if (dateSection) {
        dateSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.selectedTime) {
      // If time is missing, scroll to time section
      const timeSection = document.querySelector('.time-selector');
      if (timeSection) {
        timeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.selectedPaymentMethod) {
      // If payment is missing, scroll to payment section
      const paymentSection = document.querySelector('.payment-methods');
      if (paymentSection) {
        paymentSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.licenseFile) {
      // If license is missing, scroll to file upload
      const fileUploadSection = document.querySelector('.file-upload');
      if (fileUploadSection) {
        fileUploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}
