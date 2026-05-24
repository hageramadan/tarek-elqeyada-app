import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { Booking, BookingService } from '../../../services/booking.service';
import { CarService, Car } from '../../../services/car.service';
import { PaymentService, PaymentCheckoutRequest, PaymentMethod } from '../../../services/payment.service';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-booking-details',
  templateUrl: './booking-details.component.html',
  styleUrl: './booking-details.component.scss'
})
export class BookingDetailsComponent implements OnInit, OnChanges {
  @Input() booking!: Booking;
  @Output() extend = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() paymentInitiated = new EventEmitter<{bookingId: string | number, amount: number, paymentMethod: PaymentMethod}>();

  isProcessingPayment: boolean = false;
  showPaymentMethodsModal: boolean = false;
  paymentMethods: PaymentMethod[] = [];
  filteredPaymentMethods: PaymentMethod[] = []; // 👈 قائمة الطرق المصفاة
  selectedPaymentMethod: PaymentMethod | null = null;
  isLoadingMethods: boolean = false;
  isLoadingCar: boolean = false;
  
  // Paymob Iframe variables
  showPaymobIframe: boolean = false;
  paymobIframeUrl: SafeResourceUrl | null = null;
  lastCreatedBookingId: string | null = null;

  // متغير لحفظ الـ ID من الـ URL المباشر
  directBookingId: string | null = null;
  
  // متغيرات حالة الدفع من الـ URL
  urlPaymentStatus: string | null = null;
  isWaitingForPayment: boolean = false;

  // متغير لتخزين الإيميل
  userEmail: string | null = null;

  constructor(
    private paymentService: PaymentService,
    private bookingService: BookingService,
    private carService: CarService,
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private toastr: ToastrService
  ) {}
  
  ngOnInit(): void {
    console.log('BookingDetailsComponent initialized', this.booking);
    this.loadPaymentMethods();
    
    // محاولة استرجاع الإيميل من localStorage
    this.userEmail = localStorage.getItem('user_email') || sessionStorage.getItem('user_email');
    
    // اقرأ الـ Query Parameters من الرابط
    this.route.queryParams.subscribe(params => {
      this.urlPaymentStatus = params['paymentStatus'];
      this.isWaitingForPayment = this.urlPaymentStatus === 'pending';
      
      console.log('URL Payment Status:', this.urlPaymentStatus);
      console.log('Is waiting for payment:', this.isWaitingForPayment);
      
      // إذا كان هناك bookingId في الـ URL ولم يكن لدينا booking بعد
      const bookingIdFromUrl = params['bookingId'];
      if (bookingIdFromUrl && !this.booking) {
        this.directBookingId = bookingIdFromUrl;
        this.loadBookingDirectly(bookingIdFromUrl);
      }
    });
    
    if (!this.booking) {
      this.checkForDirectAccess();
    } else {
      this.ensureCarDataLoaded();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['booking'] && changes['booking'].currentValue) {
      console.log('Booking received via Input:', this.booking);
      this.ensureCarDataLoaded();
      this.filterPaymentMethodsByAmount(); // 👈 إعادة تصفية طرق الدفع
    }
  }

  private checkForDirectAccess(): void {
    const url = window.location.href;
    const urlParams = new URLSearchParams(window.location.search);
    
    let bookingId = urlParams.get('bookingId') || urlParams.get('id');
    
    if (!bookingId) {
      const pathMatch = url.match(/\/booking-details\/(\d+)/);
      if (pathMatch) {
        bookingId = pathMatch[1];
      }
    }
    
    if (bookingId) {
      this.directBookingId = bookingId;
      this.loadBookingDirectly(bookingId);
    } else {
      console.error('No booking ID found in URL');
      this.toastr?.error('لم يتم العثور على رقم الحجز');
    }
  }

  private loadBookingDirectly(bookingId: string): void {
    this.isLoadingCar = true;
    const id = Number(bookingId);
    
    if (isNaN(id)) {
      this.toastr?.error('رقم الحجز غير صحيح');
      this.isLoadingCar = false;
      return;
    }
    
    this.bookingService.getBookingById(id).subscribe({
      next: (response) => {
        console.log('Booking loaded directly:', response);
        if (response.result && response.data) {
          this.booking = response.data as Booking;
          this.isLoadingCar = false;
          this.ensureCarDataLoaded();
          this.filterPaymentMethodsByAmount(); // 👈 تصفية طرق الدفع بعد تحميل الحجز
          
          // بعد تحميل الحجز، تحقق من حالة الدفع
          this.checkAndUpdatePaymentStatus();
        } else {
          this.toastr?.error(response.message || 'لم يتم العثور على الحجز');
          this.isLoadingCar = false;
        }
      },
      error: (error) => {
        console.error('Error loading booking:', error);
        this.toastr?.error('حدث خطأ في تحميل بيانات الحجز');
        this.isLoadingCar = false;
      }
    });
  }

  // دالة للتحقق من حالة الدفع وتحديثها
 // دالة للتحقق من حالة الدفع وتحديثها
private checkAndUpdatePaymentStatus(): void {
    // 1. أولوية قصوى: حالة الدفع القادمة من API
    const apiPaymentStatus = this.booking?.payment_status?.toLowerCase();

    // إذا كانت API تقول "paid" أو "completed"، فهذا يعني أن الدفع تم بنجاح
    if (apiPaymentStatus === 'paid' || apiPaymentStatus === 'completed') {
        this.isWaitingForPayment = false; // تأكد من إلغاء حالة الانتظار
        console.log('Payment is already completed from API. Ignoring URL param.');
        return; // لا تفعل شيئاً آخر، الدفع مكتمل بالفعل
    }

    // 2. فقط إذا لم تكن API تؤكد اكتمال الدفع، نتحقق من Query Parameter
    // إذا كنا في حالة انتظار دفع من الـ URL
    if (this.isWaitingForPayment && this.booking) {
        console.log('Payment is pending from URL and API status is not completed, checking booking status...');

        // تأكد من أن حالة الدفع في الحجز هي pending (إذا كانت API لا تقول غير ذلك)
        if (!this.booking.payment_status || this.booking.payment_status === 'pending') {
            this.booking.payment_status = 'pending';
            console.log('Booking payment status set to pending');
        } else {
            // إذا كان هناك حالة أخرى من API (مثل failed)، لا نغيرها
            console.log('API has a different status:', this.booking.payment_status);
            this.isWaitingForPayment = false;
        }
    }
}

  // 👈 دالة تصفية طرق الدفع بناءً على المبلغ ونوع التأجير
  private filterPaymentMethodsByAmount(): void {
    const totalAmount = this.getTotalWithDelivery();
    const isMonthly = this.isMonthlyRental();
    
    this.filteredPaymentMethods = this.paymentMethods.filter((method) => {
      const methodName = method.name?.toLowerCase() || '';
      
      // استبعاد الدفع النقدي إذا لم يكن التأجير شهري
      const isCashMethod = methodName.includes('نقدا') ||
                           methodName.includes('كاش') ||
                           methodName.includes('cash') ||
                           methodName.includes('عند الاستلام');
      
      if (isCashMethod && !isMonthly) {
        console.log(`Hiding cash method ${method.name} - not monthly rental`);
        return false;
      }
      
      // التحقق من Mispay والمبلغ أقل من 200
      const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
      if (isMispay && totalAmount < 200) {
        console.log(`Hiding Mispay - amount ${totalAmount} < 200`);
        return false;
      }
      
      return true;
    });
    
    console.log('Filtered payment methods:', this.filteredPaymentMethods);
    console.log('Total amount:', totalAmount);
    console.log('Is monthly:', isMonthly);
  }

  private ensureCarDataLoaded(): void {
    if (!this.booking) {
      console.log('Booking not available yet');
      return;
    }
    
    if (this.booking.car?.imageUrl) {
      console.log('Car data already loaded with image');
      return;
    }
    
    if (this.booking.car && this.booking.car.id) {
      const carId = this.booking.car.id;
      console.log('Car data missing image, loading car with ID:', carId);
      this.isLoadingCar = true;
      
      this.carService.getCarById(carId).subscribe({
        next: (carData: Car | null) => {
          console.log('Car data loaded successfully:', carData);
          if (carData && this.booking.car) {
            this.booking.car.imageUrl = carData.image_url;
            if (carData.name) this.booking.car.name = carData.name;
            if (carData.brand) this.booking.car.brand = carData.brand;
          }
          this.isLoadingCar = false;
        },
        error: (error) => {
          console.error('Failed to load car data:', error);
          this.isLoadingCar = false;
          this.loadFullBookingFromAPI();
        }
      });
    } else {
      this.loadFullBookingFromAPI();
    }
  }

  private loadFullBookingFromAPI(): void {
    if (!this.booking || !this.booking.id) return;
    
    console.log('Loading full booking from API with ID:', this.booking.id);
    this.isLoadingCar = true;
    
    this.bookingService.getBookingById(this.booking.id).subscribe({
      next: (response) => {
        console.log('Full booking response:', response);
        
        if (response.result && response.data) {
          const fullBooking = response.data as any;
          
          if (fullBooking.car && fullBooking.car.imageUrl) {
            if (this.booking.car) {
              this.booking.car.imageUrl = fullBooking.car.imageUrl;
              if (fullBooking.car.name) this.booking.car.name = fullBooking.car.name;
              if (fullBooking.car.brand) this.booking.car.brand = fullBooking.car.brand;
            } else {
              this.booking.car = fullBooking.car;
            }
            this.isLoadingCar = false;
          } 
          else if (fullBooking.car_id) {
            this.carService.getCarById(fullBooking.car_id).subscribe({
              next: (carData: Car | null) => {
                if (carData && this.booking.car) {
                  this.booking.car.imageUrl = carData.image_url;
                  if (carData.name) this.booking.car.name = carData.name;
                  if (carData.brand) this.booking.car.brand = carData.brand;
                } else if (carData) {
                  this.booking.car = {
                    id: carData.id,
                    name: carData.name,
                    imageUrl: carData.image_url,
                    brand: carData.brand
                  };
                }
                this.isLoadingCar = false;
              },
              error: () => {
                this.isLoadingCar = false;
              }
            });
          } else {
            this.isLoadingCar = false;
          }
        } else {
          this.isLoadingCar = false;
        }
      },
      error: (error) => {
        console.error('Failed to load full booking:', error);
        this.isLoadingCar = false;
      }
    });
  }

  // ==================== دوال التحقق من نوع التأجير ====================
  
  isMonthlyRental(): boolean {
    if (!this.booking) return false;
    
    const bookingType = this.booking.booking_type?.toLowerCase() || '';
    if (bookingType === 'monthly' || bookingType === 'شهري') {
      return true;
    }
    
    if (this.booking.total_days && this.booking.total_days >= 28) {
      return true;
    }
    
    if (this.booking.start_date && this.booking.end_date) {
      const start = new Date(this.booking.start_date);
      const end = new Date(this.booking.end_date);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 28) {
        return true;
      }
    }
    
    return false;
  }

  // دالة لتصفية طرق الدفع (تعيد القائمة المصفاة)
  getNonCashPaymentMethods(): PaymentMethod[] {
    // إذا كانت القائمة المصفاة فارغة، نعيد القائمة الأصلية بعد التصفية المباشرة
    if (this.filteredPaymentMethods.length === 0 && this.paymentMethods.length > 0) {
      this.filterPaymentMethodsByAmount();
    }
    return this.filteredPaymentMethods;
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://via.placeholder.com/60x40?text=Payment';
    }
  }

  onExtend() {
    this.extend.emit();
  }

  onCancel() {
    this.cancel.emit();
  }

  isCashPayment(): boolean {
    if (!this.booking) return false;
    
    const paymentMethod = this.booking?.payment_method;
    if (paymentMethod) {
      const paymentMethodName = paymentMethod.name?.toLowerCase() || '';
      if (paymentMethodName.includes('نقدا') || 
          paymentMethodName.includes('كاش') || 
          paymentMethodName.includes('cash') ||
          paymentMethodName.includes('عند الاستلام')) {
        return true;
      }
      
      const paymentMethodId = paymentMethod.id;
      if (paymentMethodId === 12 || paymentMethodId === 13 || paymentMethodId === 5) {
        return true;
      }
    }
    
    const paymentStatus = this.booking?.payment_status?.toLowerCase() || '';
    if (paymentStatus === 'cash' || paymentStatus === 'cod' || paymentStatus === 'cash_on_delivery') {
      return true;
    }
    
    return false;
  }

  loadPaymentMethods() {
    this.isLoadingMethods = true;
    this.paymentService.getPaymentMethods().subscribe({
      next: (methods) => {
        this.paymentMethods = methods;
        this.isLoadingMethods = false;
        console.log('Payment methods loaded:', this.paymentMethods);
        // بعد تحميل طرق الدفع، قم بتصفيتها
        this.filterPaymentMethodsByAmount();
      },
      error: (error) => {
        this.isLoadingMethods = false;
        console.error('Error loading payment methods:', error);
      }
    });
  }

  // دالة محسنة للتحقق من اكتمال الدفع
  isPaymentCompleted(): boolean {
    if (!this.booking) return false;
    
    // إذا كنا في حالة انتظار دفع من الـ URL، الدفع غير مكتمل
    if (this.isWaitingForPayment) {
      console.log('Payment is pending from URL, not completed');
      return false;
    }
    
    // إذا كانت طريقة الدفع نقدية، نعتبرها مكتملة
    if (this.isCashPayment()) {
      return true;
    }
    
    // التحقق من حالة الدفع في الـ API
    const paymentStatus = this.booking.payment_status?.toLowerCase() || '';
    const bookingStatus = this.booking.status?.toLowerCase() || '';
    
    // إذا كانت الحالة pending أو waiting، فهي غير مكتملة
    if (paymentStatus === 'pending' || paymentStatus === 'waiting' || paymentStatus === '') {
      return false;
    }
    
    // الحالات التي تعتبر دفع مكتمل
    const isCompleted = paymentStatus === 'completed' || 
                        paymentStatus === 'paid' ||
                        bookingStatus === 'completed' ||
                        bookingStatus === 'confirmed' ||
                        bookingStatus === 'active' ||
                        (this.booking as any).is_paid === true;
    
    console.log('Payment completed check:', { paymentStatus, isCompleted });
    return isCompleted;
  }

 getPaymentStatusText(): string {
    if (!this.booking) return '';
    
    // الأولوية لحالة API
    const apiPaymentStatus = this.booking.payment_status?.toLowerCase();
    
    if (apiPaymentStatus === 'paid' || apiPaymentStatus === 'completed') {
        return 'تم الدفع بنجاح';
    }
    
    if (apiPaymentStatus === 'pending') {
        // التحقق من can_be_paid لتقديم رسالة أكثر دقة
        const canBePaid = (this.booking as any).status_info?.can_be_paid;
        if (canBePaid === true) {
            return 'في انتظار الدفع - يمكنك إتمام الدفع الآن';
        }
        return 'في انتظار الدفع';
    }
    
    if (apiPaymentStatus === 'failed') {
        return 'فشل الدفع';
    }
    
    // باقي المنطق القديم
    if (this.isWaitingForPayment) {
        return 'في انتظار الدفع';
    }
    if (this.isCashPayment()) {
        return 'تم الدفع (الدفع عند الاستلام)';
    }
    if (this.isPaymentCompleted()) {
        return 'تم الدفع بنجاح';
    }
    return 'لم يتم الدفع بعد';
}

  // ✅ التحقق من صحة الإيميل
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // ✅ نافذة منبثقة لطلب الإيميل لبطاقات Paymob
  askForEmailBeforePaymobPayment(callback: (email: string) => void) {
    // إنشاء نافذة منبثقة مخصصة
    const modalHtml = `
      <div id="emailModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
        <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 400px; text-align: center; direction: rtl;">
          <h3 style="margin-bottom: 20px; color: #333;">تأكيد البريد الإلكتروني</h3>
          <p style="margin-bottom: 15px; color: #666;">يرجى إدخال بريدك الإلكتروني لإتمام عملية الدفع</p>
          <input type="email" id="userEmail" placeholder="example@domain.com" style="width: 100%; padding: 12px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px;" required>
          <button id="confirmEmailBtn" style="background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-left: 10px;">تأكيد</button>
          <button id="cancelEmailBtn" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;">إلغاء</button>
        </div>
      </div>
    `;

    // إضافة النافذة إلى الصفحة
    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    document.body.appendChild(modalDiv);

    // التعامل مع إدخال الإيميل
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
      this.toastr.success(`تم تأكيد البريد: ${email}`, 'تم');
      // حفظ الإيميل للاستخدام المستقبلي
      localStorage.setItem('user_email', email);
      sessionStorage.setItem('user_email', email);
      this.userEmail = email;
      callback(email);
    });

    cancelBtn?.addEventListener('click', () => {
      closeModal();
      this.isProcessingPayment = false;
      this.toastr.warning('تم إلغاء عملية الدفع', 'تنبيه');
    });
  }

  openPaymentMethodsModal() {
    // إذا كان الحجز في حالة انتظار دفع، نسمح بالدفع
    if (this.isCashPayment() && !this.isWaitingForPayment) {
      this.toastr.warning('هذا الحجز تم باستخدام الدفع عند الاستلام، لا يمكن إعادة الدفع');
      return;
    }
    
    // تأكد من وجود طرق دفع قبل فتح النافذة
    if (this.filteredPaymentMethods.length === 0 && this.paymentMethods.length > 0) {
      this.filterPaymentMethodsByAmount();
    }
    
    console.log('Opening modal with payment methods:', this.filteredPaymentMethods);
    this.showPaymentMethodsModal = true;
  }

  closePaymentMethodsModal() {
    this.showPaymentMethodsModal = false;
    this.selectedPaymentMethod = null;
  }

  selectPaymentMethod(method: PaymentMethod) {
    console.log('Selected payment method:', method);
    this.selectedPaymentMethod = method;
    this.closePaymentMethodsModal();
    this.processRetryPayment(method);
  }

  processRetryPayment(method: PaymentMethod) {
    if (!this.booking) return;
    
    const methodName = method.name?.toLowerCase() || '';
    const totalAmount = this.getTotalWithDelivery();
    const isMonthly = this.isMonthlyRental();
    
    // التحقق من الدفع النقدي
    const isCashMethod = methodName.includes('نقدا') ||
                         methodName.includes('كاش') ||
                         methodName.includes('cash') ||
                         methodName.includes('عند الاستلام');
    
    if (isCashMethod) {
      // التحقق من أن التأجير شهري
      if (!isMonthly) {
        this.toastr.warning('عذراً، طريقة الدفع عند الاستلام متاحة فقط للإيجار الشهري', 'تنبيه');
        return;
      }
      
      // معالجة الدفع النقدي
      this.handleCashOnDeliveryRetry();
      return;
    }
    
    // التحقق من Mispay والمبلغ
    if ((methodName.includes('mispay') || methodName.includes('مسباي')) && totalAmount < 200) {
      this.toastr.warning('عذراً، طريقة الدفع Mispay متاحة فقط للمبالغ أكبر من 200 ريال', 'تنبيه');
      return;
    }
    
    // 🔥 التحقق من الإيميل لبطاقات Paymob
    const isPaymobCard = methodName.includes('فيزا') ||
                         methodName.includes('ماستر') ||
                         methodName.includes('مدى') ||
                         methodName.includes('ابل');
    
    // دالة لإتمام الدفع بعد الحصول على الإيميل
    const executePayment = (email?: string) => {
      this.isProcessingPayment = true;
      
      const payload: any = {
        amount: totalAmount,
        car_name: this.booking.car?.name || 'Car Rental',
        city: 'Riyadh',
        address: this.booking.delivery_address || 'Main Street',
        uuid: localStorage.getItem('user_uuid') || this.generateUUID(),
        zip: '12345',
        count: this.booking.total_days,
        payment_method: method.id,
        index: this.getPaymentIndex(method.name),
        first_name: 'Guest',
        last_name: 'User',
        phone_number: '0500000000',
        country: 'SA',
        state: 'Riyadh',
        booking_id: this.booking.id
      };
      
      // 🔥 إضافة الإيميل إذا كان موجوداً
      if (email) {
        payload.email = email;
        console.log('📧 Sending email for Paymob payment:', email);
      }

      const token = localStorage.getItem('auth_token');
      const headers = new HttpHeaders({
        Authorization: `Bearer ${token}`,
        'Accept-Language': 'ar',
        'Content-Type': 'application/json',
      });

      this.http.post('https://dev.tareqalqeyada.sa/api/pay/checkout', payload, { headers })
        .subscribe({
          next: (response: any) => {
            console.log('Retry payment response:', response);
            this.handlePaymentResponse(response, method.name);
          },
          error: (error) => {
            this.isProcessingPayment = false;
            console.error('Retry payment error:', error);
            this.toastr.error('حدث خطأ في معالجة الدفع', 'خطأ');
          }
        });
    };
    
    // 🔥 إذا كانت Paymob والإيميل غير موجود، اطلب الإيميل أولاً
    if (isPaymobCard) {
      // محاولة الحصول على الإيميل من الحجز أو من localStorage
      const existingEmail = this.userEmail || 
                            (this.booking as any).email || 
                            localStorage.getItem('user_email') || 
                            sessionStorage.getItem('user_email');
      
      if (existingEmail && this.isValidEmail(existingEmail)) {
        // إيميل موجود، استخدمه مباشرة
        console.log('Using existing email:', existingEmail);
        executePayment(existingEmail);
      } else {
        // لا يوجد إيميل، اطلبه من المستخدم
        this.askForEmailBeforePaymobPayment((email) => {
          executePayment(email);
        });
      }
    } else {
      // ليس Paymob، تابع بدون إيميل
      executePayment();
    }
  }

  // معالجة الدفع النقدي
  handleCashOnDeliveryRetry(): void {
    const totalAmount = this.getTotalWithDelivery();
    
    const confirmed = confirm(`سيتم تأكيد الحجز وسداد المبلغ نقداً عند الاستلام.\nالمبلغ الإجمالي: ${totalAmount} ر.س\n\nهل تريد تأكيد الحجز؟`);
    
    if (confirmed) {
      this.isProcessingPayment = true;
      
      this.paymentService.processCashPayment({
        booking_id: this.booking.id,
        amount: totalAmount
      }).subscribe({
        next: (response: any) => {
          this.isProcessingPayment = false;
          if (response.result) {
            this.toastr.success('تم تأكيد الحجز بنجاح. سيتم الدفع نقداً عند الاستلام.');
            // تحديث حالة الحجز محلياً
            if (this.booking) {
              this.booking.payment_status = 'completed';
              this.booking.status = 'confirmed';
              this.isWaitingForPayment = false;
            }
          } else {
            this.toastr.error(response.message || 'حدث خطأ في تأكيد الحجز');
          }
        },
        error: (error) => {
          this.isProcessingPayment = false;
          console.error('Error confirming cash booking:', error);
          this.toastr.error('حدث خطأ في تأكيد الحجز');
        }
      });
    }
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

  handlePaymentResponse(response: any, methodName: string) {
    if (!response.result) {
      this.isProcessingPayment = false;
      this.toastr.error(response.message || 'فشل معالجة الدفع', 'خطأ');
      return;
    }

    const data = response.data;
    const name = methodName.toLowerCase();
    const clientSecret = data?.payment?.client_secret;
    if (name.includes('فيزا') || name.includes('ماستر') || name.includes('مدى') || name.includes('ابل')) {
      this.handlePaymobPayment(data);
      return;
    }
    else if (name.includes('تمارا')) {
      const paymentUrl = data?.payment?.checkout_url;
      if (paymentUrl) {
        this.openPaymentWindow(paymentUrl);
      }
      return;
    }
    else if (name.includes('mispay') || name.includes('مسباي')) {
      const paymentUrl = data?.payment?.checkout_url || data?.payment?.raw?.result?.url;
      if (paymentUrl) {
        this.openPaymentWindow(paymentUrl);
      }
      return;
    }

    this.isProcessingPayment = false;
    this.toastr.error('لم يتم العثور على طريقة دفع صالحة', 'خطأ');
  }

  handlePaymobPayment(data: any) {
    const paymentKey = data?.payment?.payment_keys?.[0]?.key;
    const integrationId = data?.payment?.payment_keys?.[0]?.integration || 14036;

    if (!paymentKey) {
      this.isProcessingPayment = false;
      this.toastr.error('لم يتم العثور على مفتاح الدفع', 'خطأ');
      return;
    }

    // 🔥 تأكد من وجود الإيميل في الـ response
    const emailInResponse = data?.payment?.intention_detail?.billing_data?.email;
    console.log('Email sent to Paymob:', emailInResponse);

    const publicKey = 'sau_pk_test_SCltAxh7OTxzJ5ydtfIhJstUARoCOekt';
    const clientSecret = data?.payment?.client_secret;
    const paymobUrl = `https://ksa.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;

    console.log('Opening Paymob payment URL with clientSecret:', clientSecret);
    console.log('Email sent to Paymob:', emailInResponse);
    
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
        this.toastr.success('تم إغلاق نافذة الدفع، جاري التحديث', 'معلومة');
        setTimeout(() => {
          this.router.navigate(['/booking-details'], {
            queryParams: { bookingId: this.booking?.id }
          });
          window.location.reload();
        }, 1500);
      }
    }, 1000);
  }

  openPaymobInIframe(url: string) {
    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.showPaymobIframe = true;
    this.paymobIframeUrl = safeUrl;
    this.isProcessingPayment = false;

    window.addEventListener('message', (event) => {
      if (event.origin === 'https://ksa.paymob.com') {
        console.log('Paymob message received:', event.data);
        if (event.data === 'success' || event.data?.status === 'success') {
          this.completeRetryPayment();
        }
      }
    });
  }

  closePaymobIframe() {
    this.showPaymobIframe = false;
    this.paymobIframeUrl = null;
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
        this.toastr.success('تم إغلاق نافذة الدفع، جاري التحديث', 'معلومة');
        setTimeout(() => {
          this.router.navigate(['/booking-details'], {
            queryParams: { bookingId: this.booking?.id }
          });
          window.location.reload();
        }, 1500);
      }
    }, 1000);
  }

  completeRetryPayment() {
    this.toastr.success('تم الدفع بنجاح!', 'نجح');
    this.isWaitingForPayment = false;
    setTimeout(() => {
      this.router.navigate(['/booking-details'], {
        queryParams: { bookingId: this.booking?.id }
      });
      window.location.reload();
    }, 1500);
  }

  processPayment(method: PaymentMethod) {
    if (!this.booking) return;
    
    if (method.type === 'cash' || method.id === 12 || method.name.includes('نقدا')) {
      this.handleCashOnDelivery(method);
      return;
    }
    
    this.isProcessingPayment = true;
    
    const methodInfo = this.paymentService.getPaymentMethodInfo(method.id);
    
    const paymentRequest: PaymentCheckoutRequest = {
      amount: this.getTotalWithDelivery(),
      payment_method: methodInfo.paymentMethodId,
      index: methodInfo.index,
      address: this.booking.delivery_address || '',
      city: 'Riyadh',
      car_name: this.booking.car?.name || 'Car Rental',
      zip: '12345',
      uuid: localStorage.getItem('user_uuid') || this.generateUUID(),
      booking_id: typeof this.booking.id === 'number' ? this.booking.id : parseInt(this.booking.id as string)
    };

    console.log('Payment request:', paymentRequest);

    this.paymentService.processCheckout(paymentRequest).subscribe({
      next: (response) => {
        this.isProcessingPayment = false;
        this.handlePaymentResponse(response, method.name);
      },
      error: (error) => {
        this.isProcessingPayment = false;
        console.error('Payment processing error:', error);
        this.handlePaymentError(error);
      }
    });
  }

  private handleCashOnDelivery(method: PaymentMethod) {
    if (!this.booking) return;
    
    const confirmed = confirm(`سيتم تأكيد الحجز وسداد المبلغ نقداً عند الاستلام.\nالمبلغ الإجمالي: ${this.getTotalWithDelivery()} ر.س\n\nهل تريد تأكيد الحجز؟`);
    
    if (confirmed) {
      this.isProcessingPayment = true;
      
      this.paymentService.processCashPayment({
        booking_id: this.booking.id,
        amount: this.getTotalWithDelivery()
      }).subscribe({
        next: (response: any) => {
          this.isProcessingPayment = false;
          if (response.result) {
            this.toastr.success('تم تأكيد الحجز بنجاح. سيتم الدفع نقداً عند الاستلام.');
            if (this.booking) {
              this.booking.payment_status = 'completed';
              this.booking.status = 'confirmed';
              this.isWaitingForPayment = false;
            }
          } else {
            this.toastr.error(response.message || 'حدث خطأ في تأكيد الحجز');
          }
        },
        error: (error) => {
          this.isProcessingPayment = false;
          console.error('Error confirming cash booking:', error);
          this.toastr.error('حدث خطأ في تأكيد الحجز');
        }
      });
    }
  }

  private handlePaymentError(error: any): void {
    console.error('Payment error details:', error);
    
    let errorMessage = 'حدث خطأ في عملية الدفع. يرجى المحاولة مرة أخرى.';
    
    if (error.error?.message) {
      errorMessage = error.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    } else if (error.status === 0) {
      errorMessage = 'لا يمكن الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
    } else if (error.status === 401) {
      errorMessage = 'يرجى تسجيل الدخول مرة أخرى والمحاولة.';
    } else if (error.status === 500) {
      errorMessage = 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.';
    }
    
    this.toastr.error(errorMessage);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  navigateToPaymentPage(): void {
    if (!this.booking) return;
    
    if (this.isCashPayment() && !this.isWaitingForPayment) {
      this.toastr.warning('هذا الحجز تم بالدفع النقدي، لا يمكن إعادة الدفع');
      return;
    }
    this.router.navigate(['/payment'], {
      queryParams: {
        booking_id: this.booking.id,
        amount: this.getTotalWithDelivery(),
        retry: true
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    try {
      let dateToParse = dateString.trim();
      
      if (dateToParse.includes('T')) {
        const parts = dateToParse.split(' ');
        const isoPart = parts.find(p => p.includes('T'));
        if (isoPart) {
          dateToParse = isoPart;
        }
      }
      
      const date = new Date(dateToParse);
      if (isNaN(date.getTime())) return dateString;
      
      const weekdays = ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const months = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
      const weekday = weekdays[date.getDay()];
      const day = date.getDate();
      const month = months[date.getMonth()];
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'م' : 'ص';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
      return `${weekday} ${day} ${month}، ${displayHours}:${displayMinutes} ${ampm}`;
    } catch (e) {
      return dateString;
    }
  }

  getFloatValue(value: string): number {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  getDeliveryFee(): number {
    if (!this.booking) return 0;
    if (this.booking.delivery_type === 'to_location' || this.booking.delivery_type === 'delivery') {
      return 50;
    }
    return 0;
  }

  getTotalWithDelivery(): number {
    if (!this.booking) return 0;
    const basePrice = this.getFloatValue(this.booking.base_price);
    const tax = this.getFloatValue(this.booking.tax_amount);
    const deliveryFee = this.getDeliveryFee();
    return basePrice + tax + deliveryFee;
  }

  getEndDate(): string {
    if (!this.booking || !this.booking.start_date || !this.booking.total_days) return '';
    
    try {
      let dateToParse = this.booking.start_date.trim();
      
      if (dateToParse.includes('T')) {
        const parts = dateToParse.split(' ');
        const isoPart = parts.find(p => p.includes('T'));
        if (isoPart) {
          dateToParse = isoPart;
        }
      }
      
      let startDate = new Date(dateToParse);
      
      if (isNaN(startDate.getTime())) {
        const dateOnly = this.booking.start_date.split(' ')[0];
        startDate = new Date(dateOnly);
        
        if (isNaN(startDate.getTime())) {
          console.error('Failed to parse start_date:', this.booking.start_date);
          return '';
        }
      }
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + this.booking.total_days);
      
      const timeString = this.booking.start_time || '';
      
      const year = endDate.getFullYear();
      const month = String(endDate.getMonth() + 1).padStart(2, '0');
      const day = String(endDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      return this.formatDate(dateString + (timeString ? ' ' + timeString : ''));
    } catch (e) {
      console.error('Error calculating end date:', e);
      return '';
    }
  }
}