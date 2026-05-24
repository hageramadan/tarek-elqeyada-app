import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { User, AuthService } from '../../services/auth.service';
import { BookingService, BookingRequest } from '../../services/booking.service';
import { Car, CarService } from '../../services/car.service';
import { Country, CountriesService } from '../../services/countries.service';
import { PaymentService, PaymentMethod } from '../../services/payment.service';

@Component({
  selector: 'app-booking-page',
  templateUrl: './booking-page.component.html',
  styleUrls: ['./booking-page.component.scss']
})
export class BookingPageComponent implements OnInit, OnDestroy {
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
  deliveryType: 'to_location' | 'from_branch' = 'to_location';
  licenseFile: File | null = null;
  licenseImageUrl: string | null = null;
  deliveryFee: number = 0;
  taxAmount: number = 0;
  user: User | null = null;
  
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
  centerMarker: any = null;
  geocoder: any = null;
  mapCenterListener: any = null;

  availableDates: { label: string; value: string; date: Date }[] = [];
  availableTimes: string[] = [
    '9:00 ص', '9:30 ص', '10:00 ص', '10:30 ص', '11:00 ص',
    '12:00 م', '12:30 م', '1:00 م', '1:30 م', '2:00 م',
    '3:00 م', '3:30 م', '4:00 م', '4:30 م', '5:00 م'
  ];

  selectedAdditionalServices: number[] = [];

  showOtpModal = false;
  otpCode: string = '';
  otpCountryCode: string = '';
  otpPhoneNumber: string = '';
  isLoadingOtp = false;
  otpTimer: number = 60;
  otpTimerInterval: any = null;
  resendDisabled = false;

  // ✅ متغيرات الدفع
  selectedPaymentMethod: PaymentMethod | null = null;
  paymentMethods: PaymentMethod[] = [];
  filteredPaymentMethods: PaymentMethod[] = [];
  lastCreatedBookingId: string | null = null;
  showPaymobIframe: boolean = false;
  paymobIframeUrl: SafeResourceUrl | null = null;
  isProcessingPayment = false;

  constructor(
    private http: HttpClient,
    private fb: FormBuilder,
    private bookingService: BookingService,
    private countriesService: CountriesService,
    private toastr: ToastrService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router,
    private carService: CarService,
    private paymentService: PaymentService
  ) {
    this.bookingForm = this.fb.group({
      name: ['', [Validators.required]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{9,}$/)]],
      countryCode: ['+966'],
      email: ['', [Validators.email]],
      address: ['', [Validators.required]],
      zip: [''],
      city: ['الرياض']
    });
  }

  ngOnInit() {
    const carId = this.route.snapshot.paramMap.get('carId');
    console.log('🔍 Car ID from URL:', carId);
    
    if (!carId) {
      this.toastr.error('لم يتم العثور على السيارة');
      this.router.navigate(['/cars']);
      return;
    }

    const savedPeriod = localStorage.getItem('selectedRentalPeriod');
    if (savedPeriod === 'daily' || savedPeriod === 'monthly') {
      this.bookingType = savedPeriod;
    }

    this.http.get<any>(`https://dev.tareqalqeyada.sa/api/v2/cars/${carId}`).subscribe({
      next: (response) => {
        console.log('📦 Direct API response:', response);
        if (response.result && response.data?.data) {
          this.selectedCar = response.data.data;
          console.log('✅ Car loaded:', this.selectedCar);
          this.initializeFormAndData();
          this.loadPaymentMethods(); // ✅ تحميل طرق الدفع
        } else {
          console.error('❌ Car not found in response');
          this.toastr.error('السيارة غير موجودة');
          this.router.navigate(['/cars']);
        }
      },
      error: (error) => {
        console.error('❌ API Error:', error);
        this.toastr.error('حدث خطأ في تحميل بيانات السيارة');
        this.router.navigate(['/cars']);
      }
    });
  }

  ngAfterViewInit() {
    window.scrollTo(0, 0);
  }

  initializeFormAndData() {
    this.selectedAdditionalServices = [];
    this.selectedAdditionalServices.push(-1);

    this.countries = this.countriesService.getCountries();
    
    const userData = localStorage.getItem('user_data');
    let defaultCountryCode = '+966';
    if (userData) {
      try {
        this.user = JSON.parse(userData);
        if (this.user && this.user.country_code) {
          defaultCountryCode = this.user.country_code;
        }
        if (this.user && this.user.license_image) {
          this.licenseImageUrl = this.user.license_image;
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
    
    const defaultCountry = this.countriesService.getCountryByDialCode(defaultCountryCode);
    this.selectedCountry = defaultCountry || this.countries[0];
    this.bookingForm.patchValue({ countryCode: this.selectedCountry.dialCode });

    if (userData && this.user) {
      const phoneWithoutCode = this.user.phone?.replace(defaultCountryCode, '') || '';
      this.bookingForm.patchValue({
        name: this.user.name || '',
        phone: phoneWithoutCode,
        countryCode: defaultCountryCode,
        email: this.user.email || ''
      });
    }

    this.initializeDates();

    if (this.availableDates.length > 0) {
      this.selectedDate = this.availableDates[0].value;
    }
    if (this.availableTimes.length > 0) {
      this.selectedTime = this.availableTimes[0];
    }

    setTimeout(() => {
      this.calculatePriceFromAPI();
    }, 100);

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

  ngOnDestroy() {}

  // ✅ دوال الدفع
  loadPaymentMethods() {
    this.paymentService.getPaymentMethods().subscribe({
      next: (methods) => {
        if (methods && methods.length > 0) {
          this.paymentMethods = methods;
          this.filterPaymentMethodsByAmount();
          console.log('Payment methods loaded:', this.paymentMethods);
        }
      },
      error: (error) => {
        console.error('Error loading payment methods:', error);
      },
    });
  }

  filterPaymentMethodsByAmount() {
    const totalAmount = this.calculateTotal();
    
    this.filteredPaymentMethods = this.paymentMethods.filter((method) => {
      const methodName = method.name?.toLowerCase() || '';
      const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
      
      if (isMispay && totalAmount < 200) {
        console.log(`Mispay مخفية لأن المبلغ (${totalAmount}) أقل من 200`);
        return false;
      }
      
      const isCash = methodName.includes('نقدا') || 
                     methodName.includes('كاش') || 
                     methodName.includes('cash') || 
                     methodName.includes('عند الاستلام');
      
      return !isCash;
    });
    
    console.log('Filtered payment methods:', this.filteredPaymentMethods);
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  askForEmailBeforePaymobPayment() {
    const modalHtml = `
      <div id="emailModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;">
        <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; direction: rtl;">
          <h3 style="margin-bottom: 20px; color: #333;">تأكيد البريد الإلكتروني</h3>
          <p style="margin-bottom: 15px; color: #666;">يرجى إدخال بريدك الإلكتروني لإتمام عملية الدفع</p>
          <input type="email" id="userEmail" placeholder="example@domain.com" style="width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;" required>
          <button id="confirmEmailBtn" style="background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-left: 10px;">تأكيد</button>
          <button id="cancelEmailBtn" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;">إلغاء</button>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    document.body.appendChild(modalDiv);

    const emailInput = document.getElementById('userEmail') as HTMLInputElement;
    const confirmBtn = document.getElementById('confirmEmailBtn');
    const cancelBtn = document.getElementById('cancelEmailBtn');
    const modal = document.getElementById('emailModal');

    const closeModal = () => {
      modal?.remove();
    };

    confirmBtn?.addEventListener('click', () => {
      const email = emailInput?.value?.trim();
      if (!email || !this.isValidEmail(email)) {
        this.toastr.error('يرجى إدخال بريد إلكتروني صحيح', 'خطأ');
        return;
      }
      closeModal();
      this.bookingForm.patchValue({ email: email });
      this.toastr.success(`تم تأكيد البريد: ${email}`, 'تم');
      this.processPayment();
    });

    cancelBtn?.addEventListener('click', () => {
      closeModal();
      this.isProcessingPayment = false;
      this.toastr.warning('تم إلغاء عملية الدفع', 'تنبيه');
    });
  }

  async processPayment() {
    if (!this.selectedPaymentMethod) {
      this.toastr.warning('يرجى اختيار طريقة الدفع', 'تحذير');
      return;
    }

    const methodName = this.selectedPaymentMethod.name?.toLowerCase() || '';
    const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
    const totalAmount = this.calculateTotal();
    
    if (isMispay && totalAmount < 200) {
      this.toastr.error('عفواً، الدفع عبر Mispay غير متاح للمبالغ أقل من 200 ريال', 'غير متاح');
      this.isProcessingPayment = false;
      return;
    }

    const isPaymobCard = methodName.includes('فيزا') || methodName.includes('ماستر') || methodName.includes('مدى') || methodName.includes('ابل');
    const hasEmail = this.bookingForm.value.email && this.isValidEmail(this.bookingForm.value.email);

    if (isPaymobCard && !hasEmail) {
      this.askForEmailBeforePaymobPayment();
      return;
    }

    this.isProcessingPayment = true;

    const bookingRequest = this.createBookingRequest();
    if (!bookingRequest) {
      this.isProcessingPayment = false;
      return;
    }

    this.bookingService.createBooking(bookingRequest).subscribe({
      next: async (response) => {
        if (response.result) {
          this.lastCreatedBookingId = response.data?.id || response.data?.booking_id || null;

          const isCashPayment = methodName.includes('نقدا') || methodName.includes('cash');
          if (isCashPayment) {
            this.completeCashPayment();
          } else {
            await this.processCheckoutPayment(bookingRequest);
          }
        } else {
          this.isProcessingPayment = false;
          this.toastr.error(response.message || 'فشل إنشاء الحجز', 'خطأ');
        }
      },
      error: (error) => {
        this.isProcessingPayment = false;
        console.error('Booking error:', error);
        this.toastr.error(error.error?.message || 'حدث خطأ أثناء إنشاء الحجز', 'خطأ');
      },
    });
  }

  createBookingRequest(): BookingRequest | null {
    if (!this.selectedCar) return null;

    const formValue = this.bookingForm.value;
    let periodId = this.bookingType === 'monthly' ? this.getMonthlyPeriodId() : this.getDailyPeriodId();
    const carDetail = this.selectedCar.details[0];
    const totalAmount = this.calculateTotal();
    const bookingUuid = this.generateUUID();

    const bookingRequest: BookingRequest = {
      amount: totalAmount,
      address: formValue.address || this.selectedLocation?.address || '',
      city: formValue.city || 'الرياض',
      rental_company_id: carDetail.rental_company_id,
      car_id: this.selectedCar.id,
      category_id: this.selectedCar.car_category.id,
      payment_method_id: this.selectedPaymentMethod!.id,
      index: this.getPaymentIndex(this.selectedPaymentMethod!.name),
      booking_type: this.bookingType,
      start_date: this.selectedDate,
      start_time: this.convertTimeTo24Hour(this.selectedTime),
      total_days: this.totalDays,
      delivery_type: this.deliveryType,
      delivery_address: formValue.address || this.selectedLocation?.address || '',
      delivery_latitude: this.selectedLocation?.lat || 24.7136,
      delivery_longitude: this.selectedLocation?.lng || 46.6753,
      rental_company_car_period_id: periodId || undefined,
      uuid: bookingUuid
    };

    if (formValue.email) bookingRequest.email = formValue.email;
    if (formValue.zip) bookingRequest.zip = formValue.zip;
    if (this.selectedAdditionalServices.length > 0) bookingRequest.additional_services = this.selectedAdditionalServices;

    return bookingRequest;
  }

  async processCheckoutPayment(bookingRequest: BookingRequest) {
    const methodName = this.selectedPaymentMethod?.name?.toLowerCase() || '';
    const methodId = this.selectedPaymentMethod?.id;
    const index = this.getPaymentIndex(methodName);
    const totalAmount = this.calculateTotal();

    const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
    if (isMispay && totalAmount < 200) {
      this.isProcessingPayment = false;
      this.toastr.error('الدفع عبر Mispay غير متاح للمبالغ أقل من 200 ريال', 'غير متاح');
      return;
    }

    const isPaymobCard = methodName.includes('فيزا') || methodName.includes('ماستر') || methodName.includes('مدى') || methodName.includes('ابل');
    let email = '';
    if (isPaymobCard) {
      email = this.bookingForm.value.email || '';
      if (!email || !this.isValidEmail(email)) {
        this.isProcessingPayment = false;
        this.askForEmailBeforePaymobPayment();
        return;
      }
    }

    const payload: any = {
      amount: bookingRequest.amount,
      car_name: this.selectedCar?.name || '',
      city: bookingRequest.city || 'Riyadh',
      address: bookingRequest.address || 'Main Street',
      uuid: bookingRequest.uuid,
      zip: bookingRequest.zip || '12345',
      count: bookingRequest.total_days,
      payment_method: methodId,
      index: index,
      first_name: this.bookingForm.value.name || 'Guest',
      last_name: 'User',
      phone_number: this.bookingForm.value.phone || '0500000000',
      country: 'SA',
      state: this.bookingForm.value.city || 'Riyadh',
    };

    if (isPaymobCard && email) payload.email = email;
    if (methodName.includes('تمارا') || methodName.includes('tabby')) payload.email = this.bookingForm.value.email || '';

    console.log('Checkout payload:', payload);

    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'ar',
      'Content-Type': 'application/json',
    });

    this.http.post('https://dev.tareqalqeyada.sa/api/pay/checkout', payload, { headers }).subscribe({
      next: (response: any) => {
        console.log('Checkout response:', response);
        this.handlePaymentResponse(response, methodName);
      },
      error: (error) => {
        this.isProcessingPayment = false;
        console.error('Checkout error:', error);
        this.toastr.error('حدث خطأ في معالجة الدفع', 'خطأ');
      },
    });
  }

  handlePaymentResponse(response: any, methodName: string) {
    if (!response.result) {
      this.isProcessingPayment = false;
      this.toastr.error(response.message || 'فشل معالجة الدفع', 'خطأ');
      return;
    }

    const data = response.data;
    const name = methodName.toLowerCase();

    if (name.includes('فيزا') || name.includes('ماستر') || name.includes('مدى') || name.includes('ابل')) {
      this.handlePaymobPayment(data);
    }
    else if (name.includes('تمارا')) {
      const paymentUrl = data?.payment?.checkout_url;
      if (paymentUrl) {
        this.openPaymentWindow(paymentUrl);
      } else {
        this.isProcessingPayment = false;
        this.toastr.error('فشل الحصول على رابط الدفع', 'خطأ');
      }
    }
    else if (name.includes('mispay') || name.includes('مسباي')) {
      const totalAmount = this.calculateTotal();
      if (totalAmount < 200) {
        this.isProcessingPayment = false;
        this.toastr.error('عفواً، الدفع عبر Mispay غير متاح للمبالغ أقل من 200 ريال', 'غير متاح');
        return;
      }
      
      const paymentUrl = data?.payment?.checkout_url || data?.payment?.raw?.result?.url;
      if (paymentUrl) {
        this.openPaymentWindow(paymentUrl);
      } else {
        this.isProcessingPayment = false;
        this.toastr.error('فشل الحصول على رابط الدفع لـ Mispay', 'خطأ');
      }
    }
    else {
      this.isProcessingPayment = false;
      this.toastr.error('لم يتم العثور على طريقة دفع صالحة', 'خطأ');
    }
  }

  handlePaymobPayment(data: any) {
    const clientSecret = data?.payment?.client_secret;
    const publicKey = 'sau_pk_test_SCltAxh7OTxzJ5ydtfIhJstUARoCOekt';
    const paymobUrl = `https://ksa.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;
    
    console.log('Opening Paymob payment URL with clientSecret:', clientSecret);
    this.openPaymobInNewWindow(paymobUrl);
  }

  openPaymobInNewWindow(url: string) {
    this.toastr.info('سيتم فتح بوابة الدفع في نافذة جديدة', 'معلومة');
    const paymentWindow = window.open(url, '_blank');

    if (!paymentWindow) {
      this.toastr.warning('تم حظر النافذة المنبثقة، اضغط على الرابط للدفع', 'تنبيه');
      const confirmResult = confirm('سيتم فتح صفحة الدفع. اضغط OK للمتابعة');
      if (confirmResult) {
        window.location.href = url;
      }
    }

    this.isProcessingPayment = false;

    const checkInterval = setInterval(() => {
      if (paymentWindow && paymentWindow.closed) {
        clearInterval(checkInterval);
        this.toastr.success('تم إغلاق نافذة الدفع، جاري التوجيه إلى تفاصيل الحجز', 'معلومة');
        setTimeout(() => {
          this.router.navigate(['/booking-details'], {
            queryParams: {
              paymentStatus: 'pending',
              bookingId: this.lastCreatedBookingId,
            },
          });
        }, 2000);
      }
    }, 1000);
  }

  openPaymentWindow(url: string) {
    this.toastr.info('سيتم فتح صفحة الدفع في نافذة جديدة', 'معلومة');
    const paymentWindow = window.open(url, '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');

    if (!paymentWindow) {
      window.location.href = url;
    }

    this.isProcessingPayment = false;

    const checkInterval = setInterval(() => {
      if (paymentWindow && paymentWindow.closed) {
        clearInterval(checkInterval);
        this.toastr.success('تم إغلاق نافذة الدفع، جاري التوجيه إلى تفاصيل الحجز', 'معلومة');
        setTimeout(() => {
          this.router.navigate(['/booking-details'], {
            queryParams: {
              paymentStatus: 'pending',
              bookingId: this.lastCreatedBookingId,
            },
          });
        }, 1500);
      }
    }, 1000);
  }

  completeCashPayment() {
    this.isProcessingPayment = false;
    this.isLoading = false;
    this.toastr.success('تم إنشاء الحجز بنجاح! سيتم الدفع عند الاستلام');
    setTimeout(() => {
      this.router.navigate(['/booking-details'], {
        queryParams: {
          paymentStatus: 'pending',
          bookingId: this.lastCreatedBookingId,
        },
      });
    }, 1500);
  }

  getPaymentIndex(methodName: string): number {
    const name = methodName.toLowerCase();
    if (name.includes('ابل')) return 0;
    if (name.includes('فيزا') || name.includes('ماستر')) return 1;
    if (name.includes('مدى')) return 1;
    if (name.includes('تمارا')) return 3;
    if (name.includes('mispay')) return 4;
    if (name.includes('نقدا')) return 5;
    return 1;
  }

  selectPaymentMethod(method: PaymentMethod) {
    this.selectedPaymentMethod = method;
    console.log('Selected payment method:', method);
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
  }

  decreaseDays() {
    if (this.totalDays > 1) {
      this.totalDays--;
      this.calculatePriceFromAPI();
    }
  }

  selectDeliveryType(type: 'to_location' | 'from_branch') {
    this.deliveryType = type;
    this.calculatePriceFromAPI();
  }

  calculatePriceFromAPI() {
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
        console.log(response);
        this.isLoadingPrice = false;
        if (response.result && response.data) {
          this.priceData = response.data;
          const deliveryFeesFromAPI = response.data.price_breakdown?.delivery_fees;
          if (deliveryFeesFromAPI !== undefined && deliveryFeesFromAPI !== null && !isNaN(deliveryFeesFromAPI)) {
            this.deliveryFee = deliveryFeesFromAPI;
          }
          const taxFromAPI = response.data.price_breakdown?.tax;
          if (taxFromAPI !== undefined && taxFromAPI !== null && !isNaN(taxFromAPI)) {
            this.taxAmount = taxFromAPI;
          }
          this.filterPaymentMethodsByAmount(); // تحديث طرق الدفع بعد تغير السعر
        } else {
          console.error('Error calculating price:', response.message);
        }
      },
      error: (error) => {
        this.isLoadingPrice = false;
        console.error('Error calculating price:', error);
      }
    });
  }

  onLicenseFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        this.toastr.error('حجم الملف يجب أن يكون أقل من 5 ميجابايت', 'خطأ');
        event.target.value = '';
        return;
      }
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        this.toastr.error('نوع الملف غير مدعوم. يرجى اختيار PDF, PNG أو JPG', 'خطأ');
        event.target.value = '';
        return;
      }
      this.licenseFile = file;
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
    const fileInput = document.getElementById('license') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  goBack() {
    this.router.navigate(['/cars']);
  }

  formatToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
  }

  formatNumber(value: number): string {
    const formatted = this.formatToOneDecimal(value);
    if (formatted % 1 === 0) {
      return formatted.toString();
    }
    return formatted.toFixed(1);
  }

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
    const servicesTotal = this.getSelectedServicesTotal();
    
    if (this.priceData && this.priceData.price_breakdown) {
      const breakdown = this.priceData.price_breakdown;
      const basePrice = breakdown.base_price || 0;
      const deliveryFees = breakdown.delivery_fees || 0;
      const baseTax = breakdown.tax || 0;
      const discount = breakdown.discount || 0;
      const couponDiscount = breakdown.coupon_discount || 0;
      
      const subtotal = basePrice - discount - couponDiscount;
      
      let taxRate = 0;
      if (basePrice > 0 && baseTax > 0) {
        taxRate = baseTax / basePrice;
      }
      
      const servicesTax = servicesTotal * taxRate;
      const totalTax = baseTax + servicesTax;
      
      return this.formatToOneDecimal(subtotal + deliveryFees + totalTax + servicesTotal);
    }
    
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
      const dailyPrice = this.getDailyPrice();
      price = dailyPrice > 0 ? dailyPrice : this.selectedCar.details[0].price_per_day;
    }
    
    const subtotal = price * this.totalDays;
    const deliveryFees = this.priceData?.price_breakdown?.delivery_fees ?? this.deliveryFee;
    const baseTax = this.priceData?.price_breakdown?.tax ?? this.taxAmount;
    
    let taxRate = 0;
    if (subtotal > 0 && baseTax > 0) {
      taxRate = baseTax / subtotal;
    }
    const servicesTax = servicesTotal * taxRate;
    const totalTax = baseTax + servicesTax;
    
    return this.formatToOneDecimal(subtotal + deliveryFees + totalTax + servicesTotal);
  }

  getSubtotal(): number {
    if (this.priceData && this.priceData.price_breakdown) {
      return this.formatToOneDecimal(this.priceData.price_breakdown.subtotal);
    }
    
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
      const dailyPrice = this.getDailyPrice();
      price = dailyPrice > 0 ? dailyPrice : this.selectedCar.details[0].price_per_day;
    }
    
    return this.formatToOneDecimal(price * this.totalDays);
  }

  private async autoAuthenticate(countryCode: string, phone: string): Promise<void> {
    try {
      const registerResponse = await firstValueFrom(
        this.authService.register(countryCode, phone)
      );

      if (!registerResponse.result) {
        await this.loginAndVerifyOTP(countryCode, phone);
        return;
      }
    } catch (registerError) {
      await this.loginAndVerifyOTP(countryCode, phone);
      return;
    }

    await this.verifyOTPAndSave(countryCode, phone);
  }

  private async loginAndVerifyOTP(countryCode: string, phone: string): Promise<void> {
    try {
      await firstValueFrom(
        this.authService.login(countryCode, phone)
      );
      await this.verifyOTPAndSave(countryCode, phone);
    } catch (loginError) {
      throw new Error('Failed to authenticate user');
    }
  }

  private async verifyOTPAndSave(countryCode: string, phone: string): Promise<void> {
    try {
      const otpResponse = await firstValueFrom(
        this.authService.verifyOTP(countryCode, phone, '1234')
      );

      if (otpResponse.result && otpResponse.data?.user?.token) {
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

  startOtpTimer() {
    this.otpTimer = 60;
    this.resendDisabled = true;
    if (this.otpTimerInterval) {
      clearInterval(this.otpTimerInterval);
    }
    this.otpTimerInterval = setInterval(() => {
      if (this.otpTimer > 0) {
        this.otpTimer--;
      } else {
        clearInterval(this.otpTimerInterval);
        this.resendDisabled = false;
      }
    }, 1000);
  }

  async sendOtpCode() {
    this.isLoadingOtp = true;
    try {
      try {
        await firstValueFrom(this.authService.register(this.otpCountryCode, this.otpPhoneNumber));
        console.log('Register successful');
      } catch (registerError) {
        console.log('Register failed, trying login...');
        await firstValueFrom(this.authService.login(this.otpCountryCode, this.otpPhoneNumber));
        console.log('Login successful');
      }
      this.toastr.success('تم إرسال رمز التحقق إلى جوالك', 'نجح');
    } catch (error) {
      console.error('Error sending OTP:', error);
      this.toastr.error('حدث خطأ في إرسال رمز التحقق', 'خطأ');
    } finally {
      this.isLoadingOtp = false;
    }
  }

  resendOtpCode() {
    if (this.resendDisabled) return;
    this.startOtpTimer();
    this.sendOtpCode();
  }

  otpDigits: string[] = ['', '', '', ''];

  onOtpInput(event: any, index: number) {
    const value = event.target.value;
    if (value && value.length > 0) {
      this.otpDigits[index] = value.slice(-1);
      this.otpCode = this.otpDigits.join('');
      
      if (index < 3 && value) {
        const nextInput = document.getElementById(`otp${index + 2}`);
        if (nextInput) {
          nextInput.focus();
        }
      }
      
      if (this.otpCode.length === 4) {
        this.verifyOtpCode();
      }
    }
  }

  onOtpKeyDown(event: KeyboardEvent, index: number) {
    const target = event.target as HTMLInputElement;
    
    if (event.key === 'Backspace' && !target.value && index > 0) {
      const prevInput = document.getElementById(`otp${index}`);
      if (prevInput) {
        prevInput.focus();
      }
      this.otpDigits[index] = '';
      this.otpCode = this.otpDigits.join('');
    }
    
    if (event.key === 'ArrowLeft' && index > 0) {
      const prevInput = document.getElementById(`otp${index}`);
      if (prevInput) {
        prevInput.focus();
      }
    }
    
    if (event.key === 'ArrowRight' && index < 3) {
      const nextInput = document.getElementById(`otp${index + 2}`);
      if (nextInput) {
        nextInput.focus();
      }
    }
    
    if (!/^[0-9]$/.test(event.key) && 
        !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
    }
  }

  onOtpFocus(event: any) {
    if (event && event.target) {
      event.target.style.borderColor = '#6B46C1';
    }
  }

  onOtpBlur(event: any) {
    if (event && event.target) {
      event.target.style.borderColor = '#E5E7EB';
    }
  }

  async verifyOtpCode() {
    this.otpCode = this.otpDigits.join('');
    
    if (!this.otpCode || this.otpCode.length !== 4) {
      this.toastr.warning('يرجى إدخال رمز التحقق المكون من 4 أرقام', 'تنبيه');
      return;
    }

    this.isLoadingOtp = true;
    try {
      const otpResponse = await firstValueFrom(
        this.authService.verifyOTP(this.otpCountryCode, this.otpPhoneNumber, this.otpCode)
      );

      if (otpResponse.result && otpResponse.data?.user?.token) {
        localStorage.setItem('auth_token', otpResponse.data.user.token);
        localStorage.setItem('user_data', JSON.stringify(otpResponse.data.user));
        this.user = otpResponse.data.user;
        
        this.toastr.success('تم التحقق بنجاح', 'نجح');
        this.showOtpModal = false;
        this.otpCode = '';
        this.otpDigits = ['', '', '', ''];
        
        if (this.otpTimerInterval) {
          clearInterval(this.otpTimerInterval);
        }
        
        await this.processPayment();
      } else {
        this.toastr.error(otpResponse.message || 'رمز التحقق غير صحيح', 'خطأ');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      this.toastr.error('حدث خطأ في التحقق من الرمز', 'خطأ');
    } finally {
      this.isLoadingOtp = false;
    }
  }

  closeOtpModal() {
    this.showOtpModal = false;
    this.otpCode = '';
    if (this.otpTimerInterval) {
      clearInterval(this.otpTimerInterval);
    }
  }

  formatOtpTimer(): string {
    const minutes = Math.floor(this.otpTimer / 60);
    const seconds = this.otpTimer % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  async finalizeBookingAndNavigate() {
    console.log('finalizeBookingAndNavigate called');

    if (this.isLoading || this.isProcessingPayment) {
      return;
    }
    
    Object.keys(this.bookingForm.controls).forEach(key => {
      this.bookingForm.get(key)?.markAsTouched();
    });
    
    if (this.selectedLocation && !this.bookingForm.get('address')?.value) {
      this.bookingForm.patchValue({
        address: this.selectedLocation.address
      });
    }

    if (this.bookingForm.invalid) {
      console.log('Form is invalid');
      
      const invalidFields: string[] = [];
      if (this.bookingForm.get('name')?.invalid) invalidFields.push('الاسم');
      if (this.bookingForm.get('phone')?.invalid) invalidFields.push('رقم الهاتف');
       if (this.bookingForm.get('address')?.invalid) invalidFields.push('العنوان');
      if (this.bookingForm.get('city')?.invalid) invalidFields.push('المدينة');
      
      const message = invalidFields.length > 0 
        ? `يرجى ملء الحقول التالية: ${invalidFields.join('، ')}`
        : 'يرجى ملء جميع الحقول المطلوبة';
      
      this.toastr.error(message, 'حقول مطلوبة', {
        timeOut: 5000,
        positionClass: 'toast-top-center',
        closeButton: true,
        progressBar: true
      });
      
      this.scrollToFirstInvalidField();
      return;
    }

    if (!this.selectedCar) {
      console.log('No car selected');
      this.toastr.error('لم يتم اختيار سيارة', 'خطأ');
      return;
    }

    if (!this.selectedDate || !this.selectedTime) {
      console.log('No date or time selected');
      const missingFields: string[] = [];
      if (!this.selectedDate) missingFields.push('تاريخ الاستلام');
      if (!this.selectedTime) missingFields.push('وقت الاستلام');
      this.toastr.warning(`يرجى اختيار: ${missingFields.join(' و ')}`, 'تحذير');
      return;
    }

    if (!this.licenseFile && !this.licenseImageUrl) {
      this.toastr.error('يرجى رفع صورة الرخصة', 'خطأ');
      return;
    }

    if (!this.selectedPaymentMethod) {
      this.toastr.warning('يرجى اختيار طريقة الدفع', 'تحذير');
      return;
    }

    const formValue = this.bookingForm.value;
    const token = localStorage.getItem('auth_token');

    if (!token) {
      console.log('User not authenticated, showing OTP modal...');
      this.otpCountryCode = formValue.countryCode;
      this.otpPhoneNumber = formValue.phone;
      this.showOtpModal = true;
      this.otpCode = '';
      window.scrollTo({
        top: 0,
        behavior: 'instant'
      });
      
      this.startOtpTimer();
      await this.sendOtpCode();
      return;
    }

    console.log('User authenticated, proceeding to payment...');
    await this.processPayment();
  }

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

    return `${String(hour24).padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  getCarPrice(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return 0;
    }
    
    const carDetail = this.selectedCar.details[0];
    const periodType = this.getCurrentPeriodType();
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      return this.getMonthlyPrice();
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return this.getWeeklyPrice();
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return this.getYearlyPrice();
    }
    
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
    
    const period = carDetail.periods.find((p: any) => {
      if (this.bookingType === 'monthly') {
        return p?.type === 'monthly' || p?.type === 'شهري' || p?.period_type === 'monthly';
      }
      return p?.type === 'daily' || p?.type === 'يومي' || p?.period_type === 'daily';
    });
    
    if (period) {
      return period.type || period.period_type || 'daily';
    }
    
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

  getAdditionalServices(): any[] {
    const services: any[] = [];
    const deliveryFeeValue = this.priceData?.price_breakdown?.delivery_fees ?? this.deliveryFee ?? 0;
    
    const fixedDeliveryService = {
      id: -1,
      name: 'توصيل السيارة إلى مكانك',
      description: 'توصيل السيارة إلى مكانك',
      period_type: 'yearly',
      price: deliveryFeeValue,
      price_per_day: 0,
      discount: 0,
      status: 'active',
      image_url: '',
      isFixed: true
    };
    services.push(fixedDeliveryService);
    
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return services;
    }
    
    const carDetail = this.selectedCar.details[0];
    if (carDetail.office && carDetail.office.additional_services) {
      const apiServices = carDetail.office.additional_services.filter((service: any) => service.status === 'active');
      const otherServices = apiServices.filter((s: any) => 
        !s.name?.includes('توصيل') && 
        !s.name?.includes('delivery') &&
        !s.name?.includes('توصيل السيارة')
      );
      services.push(...otherServices);
    }
    
    return services;
  }

  isDeliveryService(service: any): boolean {
    return service.isFixed === true ||
           service.id === -1 ||
           service.name?.includes('توصيل') || 
           service.name?.includes('delivery') ||
           service.name?.includes('توصيل السيارة');
  }

  toggleService(serviceId: number) {
    const services = this.getAdditionalServices();
    const service = services.find((s: any) => s.id === serviceId);
    
    if (service && this.isDeliveryService(service)) {
      return;
    }
    
    const index = this.selectedAdditionalServices.indexOf(serviceId);
    if (index > -1) {
      this.selectedAdditionalServices.splice(index, 1);
    } else {
      this.selectedAdditionalServices.push(serviceId);
    }
    this.calculatePriceFromAPI();
  }

  isServiceSelected(serviceId: number): boolean {
    const services = this.getAdditionalServices();
    const service = services.find((s: any) => s.id === serviceId);
    
    if (service && this.isDeliveryService(service)) {
      return true;
    }
    
    return this.selectedAdditionalServices.indexOf(serviceId) > -1;
  }

  getActualDays(): number {
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      return this.totalDays;
    }
    
    const carDetail = this.selectedCar.details[0];
    const periodType = this.getCurrentPeriodType();
    
    if (periodType === 'daily' || periodType === 'يومي') {
      return this.totalDays;
    }
    
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
        return period.days * this.totalDays;
      }
    }
    
    if (periodType === 'monthly' || periodType === 'شهري') {
      return 30 * this.totalDays;
    } else if (periodType === 'weekly' || periodType === 'أسبوعي') {
      return 7 * this.totalDays;
    } else if (periodType === 'yearly' || periodType === 'سنوي') {
      return 365 * this.totalDays;
    }
    
    return this.totalDays;
  }

  getSelectedServicesTotal(): number {
    const services = this.getAdditionalServices();
    let total = 0;
    const actualDays = this.getActualDays();
    
    this.selectedAdditionalServices.forEach(serviceId => {
      const service = services.find((s: any) => s.id === serviceId);
      if (service) {
        if (this.isDeliveryService(service)) {
          return;
        }
        
        const servicePrice = service.price || 0;
        const periodType = service.period_type;
        
        if (periodType === 'daily' || periodType === 'يومي') {
          total += servicePrice * actualDays;
        } else {
          total += servicePrice;
        }
      }
    });
    
    return this.formatToOneDecimal(total);
  }

  getServicePriceDisplay(service: any): string {
    if (service.period_type === 'daily') {
      return `${service.price || 0} ر.س / يوم`;
    } else {
      return `${service.price || 0} ر.س`;
    }
  }

  getTotalTax(): number {
    const servicesTotal = this.getSelectedServicesTotal();
    
    if (this.priceData && this.priceData.price_breakdown) {
      const breakdown = this.priceData.price_breakdown;
      const basePrice = breakdown.base_price || 0;
      const baseTax = breakdown.tax || 0;
      
      let taxRate = 0;
      if (basePrice > 0 && baseTax > 0) {
        taxRate = baseTax / basePrice;
      }
      
      const servicesTax = servicesTotal * taxRate;
      return this.formatToOneDecimal(baseTax + servicesTax);
    }
    
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
      const dailyPrice = this.getDailyPrice();
      price = dailyPrice > 0 ? dailyPrice : this.selectedCar.details[0].price_per_day;
    }
    
    const subtotal = price * this.totalDays;
    const baseTax = this.priceData?.price_breakdown?.tax ?? this.taxAmount;
    
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
    const price = yearlyPeriod.price ?? yearlyPeriod.price_per_year ?? yearlyPeriod.amount ?? 0;
    return typeof price === 'number' ? price : Number(price) || 0;
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
    
    const price = monthlyPeriod.price ?? monthlyPeriod.price_per_month ?? monthlyPeriod.amount ?? 0;
    return typeof price === 'number' ? price : Number(price) || 0;
  }

  toggleConditions() {
    this.showConditions = !this.showConditions;
  }

  onDateChange(event: any) {
    const selectedDateValue = event.target.value;
    if (selectedDateValue) {
      const matchingDate = this.availableDates.find(d => d.value === selectedDateValue);
      if (matchingDate) {
        this.selectDate(selectedDateValue);
      } else {
        this.selectedDate = selectedDateValue;
      }
    }
  }

  getMinDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  getMaxDate(): string {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split('T')[0];
  }

  getDailyPeriodId(): number | null {
    console.log('getDailyPeriodId called');
    if (!this.selectedCar || !this.selectedCar.details || this.selectedCar.details.length === 0) {
      console.log('No car or car details');
      return null;
    }
 
    const carDetail = this.selectedCar.details[0];
    console.log('Car detail in getDailyPeriodId:', carDetail);
    console.log('Periods:', carDetail.periods);
    
    if (carDetail.periods && Array.isArray(carDetail.periods)) {
      console.log('Periods array found, length:', carDetail.periods.length);
      const dailyPeriod = carDetail.periods.find((p: any) =>
        p.type === 'daily' || p.type === 'يومي' || p.period_type === 'daily'
      );
      console.log('Daily period found:', dailyPeriod);
      if (dailyPeriod && dailyPeriod.id) {
        console.log('Returning daily period ID:', dailyPeriod.id);
        return dailyPeriod.id;
      }
      if (carDetail.periods.length > 0 && carDetail.periods[0].id) {
        console.log('Returning first period ID as fallback:', carDetail.periods[0].id);
        return carDetail.periods[0].id;
      }
    } else {
      console.log('No periods array found');
    }

    console.log('Returning null - no period found');
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

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://via.placeholder.com/400x300';
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
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = '0';
    
    window.scrollTo({
      top: 0,
      behavior: 'instant'
    });
    
    setTimeout(() => {
      this.initMap();
    }, 100);
  }

  closeMapModal() {
    this.showMapModal = false;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    
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

    if (!(window as any).google || !(window as any).google.maps) {
      setTimeout(() => {
        this.initMap();
      }, 200);
      return;
    }

    try {
      const riyadhCenter = { lat: 24.7136, lng: 46.6753 };
      const initialCenter = this.selectedLocation 
        ? { lat: this.selectedLocation.lat, lng: this.selectedLocation.lng }
        : riyadhCenter;

      this.map = new (window as any).google.maps.Map(mapElement, {
        center: initialCenter,
        zoom: 13,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        language: 'ar',
        mapTypeId: (window as any).google.maps.MapTypeId.ROADMAP,
        gestureHandling: 'greedy',
        disableDoubleClickZoom: false
      });

      this.geocoder = new (window as any).google.maps.Geocoder();
      this.createCenterMarker();

      this.mapCenterListener = this.map.addListener('center_changed', () => {
        this.updateLocationFromCenter();
      });

      this.map.addListener('dragend', () => {
        this.updateLocationFromCenter();
      });

      if (this.selectedLocation) {
        this.map.setCenter({ lat: this.selectedLocation.lat, lng: this.selectedLocation.lng });
      }
    } catch (error) {
      console.error('Error initializing map:', error);
      if (mapElement) {
        mapElement.innerHTML = '<div style="width: 100%; height: 100%; background: #F3F4F6; display: flex; align-items: center; justify-content: center; color: #6B7280; direction: rtl;">يرجى إضافة Google Maps API Key في index.html</div>';
      }
    }
  }

  createCenterMarker() {
    const mapElement = document.getElementById('map');
    if (!mapElement || !this.map) return;

    const centerMarkerDiv = document.createElement('div');
    centerMarkerDiv.className = 'center-marker-pin';
    centerMarkerDiv.innerHTML = `
      <svg width="30" height="38" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 0C8.954 0 0 8.954 0 20C0 35 20 50 20 50C20 50 40 35 40 20C40 8.954 31.046 0 20 0Z" fill="#EF4444"/>
        <circle cx="20" cy="20" r="8" fill="white"/>
      </svg>
    `;

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

  updateLocationFromCenter() {
    if (!this.map || !this.geocoder) return;

    const center = this.map.getCenter();
    const lat = center.lat();
    const lng = center.lng();

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

        if (this.geocoder) {
          this.geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
            this.isLoading = false;
            if (status === 'OK' && results[0]) {
              this.selectedLocation = {
                address: results[0].formatted_address,
                lat: lat,
                lng: lng
              };

              if (this.map) {
                this.map.setCenter({ lat, lng });
                this.map.setZoom(15);
              }

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
      return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&markers=color:red%7C${lat},${lng}&language=ar&region=SA&key=AIzaSyBAn_b3jCbl3agJl7CM7WYIHjGWJIExwfQ`;
    }
    return '';
  }

  onMapImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      // img.src = 'https://via.placeholder.com/400x200?text=Map';
    }
  }

  private scrollToFirstInvalidField(): void {
    const firstInvalidField = document.querySelector('.form-input.ng-invalid, .phone-input.ng-invalid');
    if (firstInvalidField) {
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (firstInvalidField as HTMLElement).focus();
    } else if (!this.selectedLocation) {
      const locationSection = document.querySelector('.location-container, .select-location-btn');
      if (locationSection) {
        locationSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.selectedDate) {
      const dateSection = document.querySelector('.date-selector');
      if (dateSection) {
        dateSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.selectedTime) {
      const timeSection = document.querySelector('.time-selector');
      if (timeSection) {
        timeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (!this.licenseFile && !this.licenseImageUrl) {
      const fileUploadSection = document.querySelector('.file-upload');
      if (fileUploadSection) {
        fileUploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}