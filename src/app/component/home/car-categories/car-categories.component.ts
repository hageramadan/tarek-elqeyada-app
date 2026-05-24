import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CarCategory } from '../../../services/category.service';
import { Car, CarService } from '../../../services/car.service';
import { ModalService } from '../../../services/modal.service';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

// Import Swiper and register custom elements
import { register } from 'swiper/element/bundle';

// تسجيل المكونات المخصصة لـ Swiper
register();

// تعريف واجهة لعنصر Swiper المخصص
interface SwiperElement extends HTMLElement {
  swiper: any;
  initialize: () => void;
  navigation: {
    prevEl: Element | null;
    nextEl: Element | null;
  };
  slidesPerView: number | string;
  spaceBetween: number;
  rtl: boolean;
  speed: number;
  observer: boolean;
  observeParents: boolean;
  breakpoints: any;
}

@Component({
  selector: 'app-car-categories',
  templateUrl: './car-categories.component.html',
  styleUrl: './car-categories.component.scss',
})
export class CarCategoriesComponent implements OnInit, AfterViewInit, OnDestroy {
  categories: CarCategory[] = [];

  // المتغيرات للسيارات الكاملة (جميع السيارات من API)
  allDailyEconomicCars: Car[] = [];
  allDailySuvCars: Car[] = [];
  allMonthlyEconomicCars: Car[] = [];
  allMonthlySuvCars: Car[] = [];

  // المتغيرات للسيارات المعروضة حالياً (مع عرض المزيد)
  displayedDailyEconomicCars: Car[] = [];
  displayedDailySuvCars: Car[] = [];
  displayedMonthlyEconomicCars: Car[] = [];
  displayedMonthlySuvCars: Car[] = [];

  isLoading = true;
  
  // تخزين مراجع لعناصر Swiper في DOM
  private swiperElements: Map<string, SwiperElement> = new Map();

  constructor(
    private carService: CarService,
    private modalService: ModalService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.loadCarsByCategoryAndPeriod();
  }

  ngAfterViewInit() {
    // إعداد الـ Swipers بعد تحميل العرض
    setTimeout(() => {
      this.initializeSwipers();
    }, 500);
  }

  ngOnDestroy() {
    // تنظيف الـ Swipers عند إتلاف المكون
    this.swiperElements.forEach((swiperEl) => {
      if (swiperEl && swiperEl.swiper) {
        swiperEl.swiper.destroy(true, true);
      }
    });
    this.swiperElements.clear();
  }

  /**
   * جلب السيارات باستخدام 4 طلبات متوازية
   */
  loadCarsByCategoryAndPeriod() {
    this.isLoading = true;

    const economicDaily$ = this.carService.getCarsByCategoryAndPeriod(1, 'daily');
    const economicMonthly$ = this.carService.getCarsByCategoryAndPeriod(1, 'monthly');
    const suvDaily$ = this.carService.getCarsByCategoryAndPeriod(6, 'daily');
    const suvMonthly$ = this.carService.getCarsByCategoryAndPeriod(6, 'monthly');

    forkJoin({
      economicDaily: economicDaily$,
      economicMonthly: economicMonthly$,
      suvDaily: suvDaily$,
      suvMonthly: suvMonthly$,
    }).subscribe({
      next: (results) => {
        this.allDailyEconomicCars = results.economicDaily;
        this.allDailySuvCars = results.suvDaily;
        this.allMonthlyEconomicCars = results.economicMonthly;
        this.allMonthlySuvCars = results.suvMonthly;

        this.updateDisplayedCars();
        this.isLoading = false;

        // إعادة تهيئة الـ Swipers بعد تحديث البيانات
        setTimeout(() => {
          this.initializeSwipers();
        }, 100);
      },
      error: (error) => {
        console.error('Error loading cars:', error);
        this.isLoading = false;
      },
    });
  }

  updateDisplayedCars() {
    this.displayedDailyEconomicCars = this.allDailyEconomicCars;
    this.displayedDailySuvCars = this.allDailySuvCars;
    this.displayedMonthlyEconomicCars = this.allMonthlyEconomicCars;
    this.displayedMonthlySuvCars = this.allMonthlySuvCars;
  }

  /**
   * تهيئة كل Swiper على حدة عن طريق ضبط خصائصه في DOM
   */
  private initializeSwipers() {
    const swiperIds = ['slider1', 'slider2', 'slider3', 'slider4'];
    
    swiperIds.forEach(id => {
      const swiperEl = document.querySelector(`#${id}`) as SwiperElement;
      if (swiperEl && !this.swiperElements.has(id)) {
        
        // إعدادات الـ Swiper لعرض 3 كروت
        const swiperParams = {
          slidesPerView: 1.5,
          spaceBetween: 16,
          rtl: true,
          speed: 500,
          observer: true,
          observeParents: true,
          centeredSlides: false,
          breakpoints: {
              0: { 
            slidesPerView: 1.5, 
            spaceBetween: 12,
            centeredSlides: false,
          },
            640: { slidesPerView: 1.5, spaceBetween: 16 },
            768: { slidesPerView: 2, spaceBetween: 20 },
            1024: { slidesPerView: 2.5, spaceBetween: 20 },
            1280: { slidesPerView: 3, spaceBetween: 24 }
          }
        };

        // تطبيق الإعدادات على العنصر
        Object.assign(swiperEl, swiperParams);

        // الحصول على أزرار التنقل
        const prevBtn = document.querySelector(`.${id.replace('slider', 'slider')}-prev`);
        const nextBtn = document.querySelector(`.${id.replace('slider', 'slider')}-next`);
        
        // إعداد أزرار التنقل
        if (prevBtn && nextBtn) {
          Object.assign(swiperEl, {
            navigation: {
              prevEl: prevBtn,
              nextEl: nextBtn,
            }
          });
        }

        // تهيئة الـ Swiper
        swiperEl.initialize();
        
        // تخزين مرجع لعنصر Swiper
        this.swiperElements.set(id, swiperEl);
        console.log(`✅ Swiper ${id} initialized`);
      }
    });
  }

  /**
   * تحديث جميع الـ Swipers
   */
  updateAllSwipers() {
    this.swiperElements.forEach(swiperEl => {
      if (swiperEl && swiperEl.swiper && swiperEl.swiper.update) {
        swiperEl.swiper.update();
      }
    });
  }

  /**
   * التحقق من وجود سيارات في أي قسم
   */
  get hasAnyCars(): boolean {
    return this.displayedDailyEconomicCars.length > 0 ||
           this.displayedDailySuvCars.length > 0 ||
           this.displayedMonthlyEconomicCars.length > 0 ||
           this.displayedMonthlySuvCars.length > 0;
  }

  /**
   * دالة مساعدة للـ *ngFor مع trackBy لتحسين الأداء
   */
  trackByCarId(index: number, car: Car): number {
    return car.id;
  }

  // ========== دوال عرض بيانات السيارة ==========
  
  getCarPrice(car: Car, periodType: 'daily' | 'monthly' = 'daily'): number {
    if (car.details && car.details.length > 0) {
      const periods = car.details[0]?.periods;
      if (periods && Array.isArray(periods)) {
        const matchedPeriod = periods.find(
          (p) =>
            p.type === periodType ||
            (periodType === 'daily' &&
              (p.type === 'daily' || p.period_type === 'daily')) ||
            (periodType === 'monthly' &&
              (p.type === 'monthly' || p.period_type === 'monthly')),
        );
        if (matchedPeriod) {
          return matchedPeriod.price;
        }
      }
      return car.details[0]?.price_per_day || 0;
    }
    return 0;
  }

  getFormattedPrice(
    car: Car,
    periodType: 'daily' | 'monthly' = 'daily',
  ): string {
    const price = this.getCarPrice(car, periodType);
    return price.toString();
  }

  getCarPickupTime(car: Car): string {
    if (
      car.details &&
      car.details.length > 0 &&
      car.details[0]?.office?.quick_policy
    ) {
      return (
        car.details[0].office.quick_policy.pickup_within_hour_text ||
        'استلام خلال ساعة'
      );
    }
    return 'استلام خلال ساعة';
  }

  getCarKilometers(car: Car): string {
    if (
      car.details &&
      car.details.length > 0 &&
      car.details[0]?.office?.quick_policy
    ) {
      return (
        car.details[0].office.quick_policy.km_limit_text || '200 كم / يومياً'
      );
    }
    return '200 كم / يومياً';
  }

  getCarFeaturesText(car: Car): string {
    if (car.features && car.features.trim() !== '') {
      return car.features.trim();
    }
    return '';
  }

  getCarDeductibleText(car: Car): string {
    if (
      car.details &&
      car.details.length > 0 &&
      car.details[0]?.office?.quick_policy
    ) {
      return car.details[0].office.quick_policy.deductible_text || '';
    }
    return '';
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = 'https://via.placeholder.com/400x300?text=No+Image';
    }
  }

  openBookingModal(car: Car, periodType: 'daily' | 'monthly' = 'daily') {
    localStorage.setItem('selectedRentalPeriod', periodType);
    localStorage.setItem('selectedCarId', car.id.toString());
    this.router.navigate(['/booking', car.id]);
  }
}