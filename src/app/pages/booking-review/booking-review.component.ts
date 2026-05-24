import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { BookingService, BookingRequest } from '../../services/booking.service';
import { PaymentService, PaymentMethod } from '../../services/payment.service';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-booking-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking-review.component.html',
  styleUrls: ['./booking-review.component.scss'],
})
export class BookingReviewComponent implements OnInit {
  reviewData: any = null;
  isLoading = false;
  selectedPaymentMethod: PaymentMethod | null = null;
  paymentMethods: PaymentMethod[] = [];
  filteredPaymentMethods: PaymentMethod[] = []; // 👈 قائمة جديدة للطرق المصفاة
  lastCreatedBookingId: string | null = null;
  // متغيرات Paymob
  showPaymobIframe: boolean = false;
  paymobIframeUrl: SafeResourceUrl | null = null;

  constructor(
    private router: Router,
    private toastr: ToastrService,
    private bookingService: BookingService,
    private paymentService: PaymentService,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit() {
    this.loadReviewData();
    this.loadPaymentMethods();
  }

  loadReviewData() {
    const storedData = sessionStorage.getItem('review_booking_data');
    if (storedData) {
      this.reviewData = JSON.parse(storedData);
      console.log('Review data loaded:', this.reviewData);
    } else {
      this.toastr.error('لم يتم العثور على بيانات الحجز', 'خطأ');
      this.router.navigate(['/cars']);
    }
  }

  loadPaymentMethods() {
    this.paymentService.getPaymentMethods().subscribe({
      next: (methods) => {
        if (methods && methods.length > 0) {
          this.paymentMethods = methods;
          this.filterPaymentMethodsByAmount(); // 👈 تصفية الطرق بناءً على المبلغ
          console.log('Payment methods loaded:', this.paymentMethods);
        }
      },
      error: (error) => {
        console.error('Error loading payment methods:', error);
      },
    });
  }

  // ✅ دالة جديدة لتصفية طرق الدفع بناءً على المبلغ الإجمالي
  filterPaymentMethodsByAmount() {
    const totalAmount = this.reviewData?.totalAmount || 0;
    
    this.filteredPaymentMethods = this.paymentMethods.filter((method) => {
      const methodName = method.name?.toLowerCase() || '';
      const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
      
      // 🔥 الشرط الجديد: إذا كانت Mispay والمبلغ أقل من 200، نخفيها
      if (isMispay && totalAmount < 200) {
        console.log(`Mispay مخفية لأن المبلغ (${totalAmount}) أقل من 200`);
        return false;
      }
      
      // استبعاد الدفع النقدي (إذا أردت إخفاءه أيضاً)
      const isCash = methodName.includes('نقدا') || 
                     methodName.includes('كاش') || 
                     methodName.includes('cash') || 
                     methodName.includes('عند الاستلام');
      
      return !isCash;
    });
    
    console.log('Filtered payment methods:', this.filteredPaymentMethods);
  }

  // ✅ التحقق من صحة الإيميل
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // ✅ نافذة منبثقة لطلب الإيميل لبطاقات Paymob
  askForEmailBeforePaymobPayment() {
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
      // حفظ الإيميل في formValue ثم متابعة الدفع
      if (!this.reviewData.formValue) {
        this.reviewData.formValue = {};
      }
      this.reviewData.formValue.email = email;
      this.toastr.success(`تم تأكيد البريد: ${email}`, 'تم');
      // متابعة الدفع بعد إدخال الإيميل
      this.processPayment();
    });

    cancelBtn?.addEventListener('click', () => {
      closeModal();
      this.isLoading = false;
      this.toastr.warning('تم إلغاء عملية الدفع', 'تنبيه');
    });
  }

  async processPayment() {
    if (!this.selectedPaymentMethod) {
      this.toastr.warning('يرجى اختيار طريقة الدفع', 'تحذير');
      return;
    }

    // 🔥 التحقق الإضافي من أن Mispay متاحة للمبلغ المناسب قبل الدفع
    const methodName = this.selectedPaymentMethod.name?.toLowerCase() || '';
    const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
    const totalAmount = this.reviewData?.totalAmount || 0;
    
    if (isMispay && totalAmount < 200) {
      this.toastr.error('عفواً، الدفع عبر Mispay غير متاح للمبالغ أقل من 200 ريال', 'غير متاح');
      this.isLoading = false;
      return;
    }

    // 🔥 إذا كانت طريقة الدفع من Paymob والإيميل غير موجود، اطلب الإيميل أولاً
    const isPaymobCard =
      methodName.includes('فيزا') ||
      methodName.includes('ماستر') ||
      methodName.includes('مدى') ||
      methodName.includes('ابل');

    const hasEmail =
      this.reviewData?.formValue?.email &&
      this.isValidEmail(this.reviewData.formValue.email);

    if (isPaymobCard && !hasEmail) {
      this.askForEmailBeforePaymobPayment();
      return;
    }

    this.isLoading = true;

    const data = this.reviewData;
    const carDetail = data.selectedCar?.details?.[0];
    const periods = carDetail?.periods || [];

    let selectedPeriod = null;
    if (data.bookingType === 'monthly') {
      selectedPeriod = periods.find((p: any) => p.type === 'monthly');
    } else if (data.bookingType === 'weekly') {
      selectedPeriod = periods.find((p: any) => p.type === 'weekly');
    } else {
      selectedPeriod = periods.find((p: any) => p.type === 'daily');
    }

    const categoryId =
      selectedPeriod?.category_id ||
      (data.bookingType === 'monthly'
        ? 2
        : data.bookingType === 'weekly'
          ? 22
          : 1);

    const periodId =
      selectedPeriod?.id ||
      (data.bookingType === 'monthly'
        ? 56
        : data.bookingType === 'weekly'
          ? 118
          : 117);

    const bookingRequest: BookingRequest = {
      amount: data.totalAmount,
      address: data.formValue?.address || data.selectedLocation?.address || '',
      city: data.formValue?.city || 'الرياض',
      rental_company_id: carDetail?.rental_company_id,
      car_id: data.selectedCar?.id,
      category_id: categoryId,
      payment_method_id: this.selectedPaymentMethod.id,
      index: this.getPaymentIndex(this.selectedPaymentMethod.name),
      booking_type: data.bookingType || 'daily',
      start_date: data.selectedDate,
      start_time: this.convertTimeTo24Hour(data.selectedTime),
      total_days: data.totalDays || 1,
      delivery_type: data.deliveryType || 'to_location',
      delivery_address:
        data.formValue?.address || data.selectedLocation?.address || '',
      delivery_latitude: data.selectedLocation?.lat || 24.7136,
      delivery_longitude: data.selectedLocation?.lng || 46.6753,
      rental_company_car_period_id: periodId,
      uuid: this.generateUUID(),
    };

    if (data.selectedAdditionalServices?.length > 0) {
      bookingRequest.additional_services = data.selectedAdditionalServices;
    }
    if (data.formValue?.email) {
      bookingRequest.email = data.formValue.email;
    }
    if (data.formValue?.zip) {
      bookingRequest.zip = data.formValue.zip;
    }

    console.log('Creating booking:', bookingRequest);

    this.bookingService.createBooking(bookingRequest).subscribe({
      next: async (response) => {
      
        if (response.result) {
          // حفظ معرف الحجز
         this.lastCreatedBookingId = response.data?.id || response.data?.booking_id  || null;

          // إذا كانت طريقة الدفع نقداً، نقوم بتحديث الحالة فوراً
          const isCashPayment =
            methodName.includes('نقدا') || methodName.includes('cash');

          if (isCashPayment) {
            this.completeCashPayment();
          } else {
            await this.processCheckoutPayment(bookingRequest);
          }
        } else {
          this.isLoading = false;
          this.toastr.error(response.message || 'فشل إنشاء الحجز', 'خطأ');
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Booking error:', error);
        this.toastr.error(
          error.error?.message || 'حدث خطأ أثناء إنشاء الحجز',
          'خطأ',
        );
      },
    });
  }
 
  async processCheckoutPayment(bookingRequest: BookingRequest) {
    const methodName = this.selectedPaymentMethod?.name?.toLowerCase() || '';
    const methodId = this.selectedPaymentMethod?.id;
    const index = this.getPaymentIndex(methodName);

    // 🔥 التحقق من Mispay مرة أخرى
    const isMispay = methodName.includes('mispay') || methodName.includes('مسباي');
    const totalAmount = this.reviewData?.totalAmount || 0;
    
    if (isMispay && totalAmount < 200) {
      this.isLoading = false;
      this.toastr.error('الدفع عبر Mispay غير متاح للمبالغ أقل من 200 ريال', 'غير متاح');
      return;
    }

    // 🔥 تحديد إذا كانت طريقة الدفع من Paymob
    const isPaymobCard =
      methodName.includes('فيزا') ||
      methodName.includes('ماستر') ||
      methodName.includes('مدى') ||
      methodName.includes('ابل');

    // 🔥 جلب الإيميل فقط لـ Paymob
    let email = '';
    if (isPaymobCard) {
      email = this.reviewData?.formValue?.email || bookingRequest.email || '';

      // إذا لم يوجد إيميل صالح، اطلبه من المستخدم
      if (!email || !this.isValidEmail(email)) {
        this.isLoading = false;
        this.askForEmailBeforePaymobPayment();
        return;
      }
    }

    const payload: any = {
      amount: bookingRequest.amount,
      car_name: this.reviewData.selectedCar?.name || '',
      city: bookingRequest.city || 'Riyadh',
      address: bookingRequest.address || 'Main Street',
      uuid: bookingRequest.uuid,
      zip: bookingRequest.zip || '12345',
      count: bookingRequest.total_days,
      payment_method: methodId,
      index: index,
      first_name: this.reviewData.formValue?.first_name || 'Guest',
      last_name: this.reviewData.formValue?.last_name || 'User',
      phone_number: this.reviewData.formValue?.phone || '0500000000',
      country: 'SA',
      state: this.reviewData.formValue?.city || 'Riyadh',
    };

    // 🔥 فقط لـ Paymob نضيف الإيميل
    if (isPaymobCard && email) {
      payload.email = email;
      console.log('📧 Sending email for Paymob payment:', email);
    }

    // لـ Tamara أو Tabby
    if (methodName.includes('تمارا') || methodName.includes('tabby')) {
      payload.email = this.reviewData.formValue?.email || '';
    }

    console.log('Checkout payload:', payload);

    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'ar',
      'Content-Type': 'application/json',
    });

    this.http
      .post('https://dev.tareqalqeyada.sa/api/pay/checkout', payload, {
        headers,
      })
      .subscribe({
        next: (response: any) => {
          console.log('Checkout response:', response);
          this.handlePaymentResponse(response, methodName);
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Checkout error:', error);
          this.toastr.error('حدث خطأ في معالجة الدفع', 'خطأ');
        },
      });
  }
  
  handlePaymentResponse(response: any, methodName: string) {
    if (!response.result) {
      this.isLoading = false;
      this.toastr.error(response.message || 'فشل معالجة الدفع', 'خطأ');
      return;
    }

    const data = response.data;
    const name = methodName.toLowerCase();

    // ✅ Paymob (فيزا, ماستر, مدى, أبل باي)
    if (
      name.includes('فيزا') ||
      name.includes('ماستر') ||
      name.includes('مدى') ||
      name.includes('ابل')
    ) {
      this.handlePaymobPayment(data);
      return;
    }
    // ✅ Tamara
    else if (name.includes('تمارا')) {
      const paymentUrl = data?.payment?.checkout_url;
      if (paymentUrl) {
        this.openPaymentWindow(paymentUrl);
      }
      return;
    }
    // ✅ Mispay
    else if (name.includes('mispay') || name.includes('مسباي')) {
      // ✅ التحقق من المبلغ قبل معالجة الدفع
      const totalAmount = this.reviewData?.totalAmount || 0;
      if (totalAmount < 200) {
        this.isLoading = false;
        this.toastr.error('عفواً، الدفع عبر Mispay غير متاح للمبالغ أقل من 200 ريال', 'غير متاح');
        return;
      }
      
      const paymentUrl =
        data?.payment?.checkout_url || data?.payment?.raw?.result?.url;
      if (paymentUrl) {
        this.openPaymentWindow(paymentUrl);
      } else {
        this.isLoading = false;
        this.toastr.error('فشل الحصول على رابط الدفع لـ Mispay', 'خطأ');
      }
      return;
    }
    // ✅ نقداً (الدفع عند الاستلام)
    else if (
      name.includes('نقدا') ||
      name.includes('cash') ||
      name.includes('عند الاستلام')
    ) {
      this.completeCashPayment();
      return;
    }

    this.isLoading = false;
    this.toastr.error('لم يتم العثور على طريقة دفع صالحة', 'خطأ');
  }

  // ✅ فتح Paymob في نافذة جديدة
  openPaymobInNewWindow(url: string) {
    this.toastr.info('سيتم فتح بوابة الدفع في نافذة جديدة', 'معلومة');

    // فتح النافذة
    const paymentWindow = window.open(url, '_blank');

    if (!paymentWindow) {
      // إذا تم حظر النافذة، نستخدم الرابط مباشرة
      this.toastr.warning(
        'تم حظر النافذة المنبثقة، اضغط على الرابط للدفع',
        'تنبيه',
      );
      const confirmResult = confirm('سيتم فتح صفحة الدفع. اضغط OK للمتابعة');
      if (confirmResult) {
        window.location.href = url;
      }
    }

    this.isLoading = false;

    // مراقبة إغلاق النافذة
    const checkInterval = setInterval(() => {
      if (paymentWindow && paymentWindow.closed) {
        clearInterval(checkInterval);
        this.toastr.success(
          'تم إغلاق نافذة الدفع، جاري التوجيه إلى  تفاصيل الحجز',
          'معلومة',
        );
        setTimeout(() => {
          sessionStorage.removeItem('review_booking_data');
          sessionStorage.removeItem('license_file_base64');
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

  handlePaymobPayment(data: any) {
  // 🔥 تأكد من وجود الإيميل في الـ response
  const emailInResponse = data?.payment?.intention_detail?.billing_data?.email;
  console.log('Email sent to Paymob:', emailInResponse);

  // ✅ استخراج clientSecret من الـ response
  const clientSecret = data?.payment?.client_secret;
  const paymentKey = data?.payment?.payment_keys?.[0]?.key;
  const integrationId = data?.payment?.payment_keys?.[0]?.integration || 14036;
 
  // ✅ التحقق من وجود clientSecret
  if (!clientSecret) {
    this.isLoading = false;
    this.toastr.error('لم يتم العثور على clientSecret للدفع', 'خطأ');
    return;
  }

  if (!paymentKey) {
    this.isLoading = false;
    this.toastr.error('لم يتم العثور على مفتاح الدفع', 'خطأ');
    return;
  }

  // ✅ استخدام clientSecret في رابط الدفع (الطريقة الصحيحة لـ Paymob)
  // const paymobUrl = `https://ksa.paymob.com/unifiedcheckout?clientSecret=${clientSecret}`;
  const publicKey = 'sau_pk_test_SCltAxh7OTxzJ5ydtfIhJstUARoCOekt';

const paymobUrl =
`https://ksa.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;

// window.open(paymobUrl, '_blank');
  console.log('Opening Paymob payment URL with clientSecret:', clientSecret);
  console.log('Email sent to Paymob:', emailInResponse);
  
  this.openPaymobInNewWindow(paymobUrl);
}

  // ✅ دالة لتصفية طرق الدفع وإخفاء "الدفع عند الاستلام" عندما لا يكون الإيجار شهري
  // ✅ وإخفاء Mispay عندما يكون المبلغ أقل من 200
  getNonCashPaymentMethods(): PaymentMethod[] {
    // استخدام القائمة المصفاة مسبقاً
    return this.filteredPaymentMethods;
  }
  
  // ✅ فتح Paymob في iframe منبثق
  openPaymobInIframe(url: string) {
    // تنظيف الرابط
    const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.showPaymobIframe = true;
    this.paymobIframeUrl = safeUrl;
    this.isLoading = false;

    // مراقبة رسائل postMessage من Paymob
    window.addEventListener('message', (event) => {
      if (event.origin === 'https://ksa.paymob.com') {
        console.log('Paymob message received:', event.data);
        if (event.data === 'success' || event.data?.status === 'success') {
          this.completePayment();
        }
      }
    });
  }

  // ✅ إغلاق iframe
  closePaymobIframe() {
    this.showPaymobIframe = false;
    this.paymobIframeUrl = null;
    this.completePayment();
  }

  // ✅ إكمال الدفع بنجاح
  completePayment() {
    this.toastr.success('تم الدفع بنجاح! جاري إنشاء الحجز...', 'نجح');
    sessionStorage.removeItem('review_booking_data');
    sessionStorage.removeItem('license_file_base64');
    setTimeout(() => {
        this.router.navigate(['/booking-details'], {
        queryParams: {
          paymentStatus: 'pending',
          bookingId: this.lastCreatedBookingId,
        },
      });
    }, 1500);
  }

  // ✅ إكمال الدفع النقدي
  completeCashPayment() {
    this.isLoading = false;
    this.toastr.success('تم إنشاء الحجز بنجاح! سيتم الدفع عند الاستلام');
    sessionStorage.removeItem('review_booking_data');
    sessionStorage.removeItem('license_file_base64');
    setTimeout(() => {
      this.router.navigate(['/booking-details'], {
        queryParams: {
          paymentStatus: 'pending',
          bookingId: this.lastCreatedBookingId,
        },
      });
    }, 1500);
  }

  // ✅ فتح نافذة عادية لـ Tamara و Mispay
  openPaymentWindow(url: string) {
    this.toastr.info('سيتم فتح صفحة الدفع في نافذة جديدة', 'معلومة');
    const paymentWindow = window.open(
      url,
      '_blank',
      'width=800,height=600,scrollbars=yes,resizable=yes',
    );

    if (!paymentWindow) {
      window.location.href = url;
    }

    this.isLoading = false;

    const checkInterval = setInterval(() => {
      if (paymentWindow && paymentWindow.closed) {
        clearInterval(checkInterval);
        this.toastr.success(
          'تم إغلاق نافذة الدفع، جاري التوجيه إلى ملفك الشخصي',
          'معلومة',
        );
        setTimeout(() => {
          sessionStorage.removeItem('review_booking_data');
          sessionStorage.removeItem('license_file_base64');
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

  confirmBooking() {
    this.processPayment();
  }

  selectPaymentMethod(method: PaymentMethod) {
    this.selectedPaymentMethod = method;
    console.log('Selected payment method:', method);
  }

  goBack() {
    this.router.navigate(['/booking']);
  }

  convertTimeTo24Hour(time: string): string {
    if (!time) return '09:00';
    const parts = time.split(' ');
    if (parts.length < 2) return '09:00';
    const [timePart, period] = parts;
    const [hours, minutes] = timePart.split(':');
    let hour24 = parseInt(hours);
    if (period === 'م' && hour24 !== 12) hour24 += 12;
    if (period === 'ص' && hour24 === 12) hour24 = 0;
    return `${String(hour24).padStart(2, '0')}:${minutes || '00'}`;
  }

  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16).toUpperCase();
      },
    );
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  }

  getCarPrice(): number {
    if (!this.reviewData?.selectedCar?.details?.[0]) return 0;
    const carDetail = this.reviewData.selectedCar.details[0];
    const periodType = this.getCurrentPeriodType();
    if (periodType === 'monthly') {
      return this.getMonthlyPrice();
    }
    return carDetail.price_per_day || 0;
  }

  getCurrentPeriodType(): string {
    if (!this.reviewData?.selectedCar?.details?.[0]?.periods) return 'daily';
    const periods = this.reviewData.selectedCar.details[0].periods;
    const period = periods.find(
      (p: any) =>
        this.reviewData.bookingType === 'monthly' &&
        (p.type === 'monthly' || p.type === 'شهري'),
    );
    return period ? 'monthly' : 'daily';
  }

  getPeriodLabel(): string {
    return this.getCurrentPeriodType() === 'monthly' ? 'الشهر' : 'اليوم';
  }

  getPeriodDaysLabel(): string {
    return this.getCurrentPeriodType() === 'monthly' ? 'شهور' : 'ايام';
  }

  private getMonthlyPrice(): number {
    const periods = this.reviewData.selectedCar.details[0].periods;
    const monthlyPeriod = periods.find(
      (p: any) => p.type === 'monthly' || p.type === 'شهري',
    );
    return monthlyPeriod?.price || 0;
  }

  getSubtotal(): number {
    const price = this.getCarPrice();
    return price * (this.reviewData?.totalDays || 1);
  }

  getSelectedServicesTotal(): number {
    return this.reviewData?.getSelectedServicesTotal || 0;
  }

  getDeliveryFees(): number {
    return this.reviewData?.getDeliveryFees || 0;
  }

  getTotalTax(): number {
    return this.reviewData?.getTotalTax || 0;
  }

  calculateTotal(): number {
    const subtotal = this.getSubtotal();
    const servicesTotal = this.getSelectedServicesTotal();
    const deliveryFees = this.getDeliveryFees();
    const tax = this.getTotalTax();
    return subtotal + servicesTotal + deliveryFees + tax;
  }

  formatNumber(value: number): string {
    if (!value) return '0';
    return Math.round(value * 10) / 10 + '';
  }

  getCarPickupTime(): string {
    const carDetail = this.reviewData?.selectedCar?.details?.[0];
    if (carDetail?.office?.quick_policy) {
      return (
        carDetail.office.quick_policy.pickup_within_hour_text ||
        'استلام خلال ساعة'
      );
    }
    return 'استلام خلال ساعة';
  }

  getCarKilometers(): string {
    const carDetail = this.reviewData?.selectedCar?.details?.[0];
    if (carDetail?.office?.quick_policy) {
      return carDetail.office.quick_policy.km_limit_text || '200 كم / يومياً';
    }
    return '200 كم / يومياً';
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://via.placeholder.com/60x40?text=Payment';
    }
  }
}