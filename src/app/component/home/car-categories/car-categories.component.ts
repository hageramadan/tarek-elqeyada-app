import { Component, OnInit, AfterViewInit, OnDestroy, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CarCategory } from '../../../services/category.service';
import { Car, CarService } from '../../../services/car.service';
import { ModalService } from '../../../services/modal.service';
import { Router } from '@angular/router';

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
export class CarCategoriesComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  categories: CarCategory[] = [];

  // استقبال البيانات من الصفحة الرئيسية عبر @Input()
  @Input() allDailyEconomicCars: Car[] = [];
  @Input() allDailySuvCars: Car[] = [];
  @Input() allMonthlyEconomicCars: Car[] = [];
  @Input() allMonthlySuvCars: Car[] = [];

  // المتغيرات للسيارات المعروضة حالياً
  displayedDailyEconomicCars: Car[] = [];
  displayedDailySuvCars: Car[] = [];
  displayedMonthlyEconomicCars: Car[] = [];
  displayedMonthlySuvCars: Car[] = [];

  // متغير لتتبع ما إذا كانت البيانات قد تم تحميلها
  private dataLoaded = false;
  
  // تخزين مراجع لعناصر Swiper في DOM
  private swiperElements: Map<string, SwiperElement> = new Map();

  constructor(
    private carService: CarService,
    private modalService: ModalService,
    private router: Router,
  ) {}

  ngOnInit() {
    // لا نقوم بجلب البيانات هنا، بل ننتظرها من Input
  }

  ngOnChanges(changes: SimpleChanges) {
    // عندما تتغير البيانات المدخلة (عند تحميلها من الصفحة الرئيسية)
    if (changes['allDailyEconomicCars'] && changes['allDailyEconomicCars'].currentValue ||
        changes['allDailySuvCars'] && changes['allDailySuvCars'].currentValue ||
        changes['allMonthlyEconomicCars'] && changes['allMonthlyEconomicCars'].currentValue ||
        changes['allMonthlySuvCars'] && changes['allMonthlySuvCars'].currentValue) {
      
      this.updateDisplayedCars();
      
      // تهيئة Swipers بعد تحميل البيانات
      setTimeout(() => {
        if (this.hasAnyCars && !this.dataLoaded) {
          this.dataLoaded = true;
          this.initializeSwipers();
        } else if (this.hasAnyCars) {
          this.updateAllSwipers();
        }
      }, 200);
    }
  }

  ngAfterViewInit() {
    // إذا كانت البيانات موجودة بالفعل، قم بتهيئة Swipers
    if (this.hasAnyCars && !this.dataLoaded) {
      setTimeout(() => {
        this.dataLoaded = true;
        this.initializeSwipers();
      }, 500);
    }
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

  updateDisplayedCars() {
    this.displayedDailyEconomicCars = [...this.allDailyEconomicCars];
    this.displayedDailySuvCars = [...this.allDailySuvCars];
    this.displayedMonthlyEconomicCars = [...this.allMonthlyEconomicCars];
    this.displayedMonthlySuvCars = [...this.allMonthlySuvCars];
    
    console.log('✅ تم تحديث بيانات السيارات:', {
      economicDaily: this.displayedDailyEconomicCars.length,
      suvDaily: this.displayedDailySuvCars.length,
      economicMonthly: this.displayedMonthlyEconomicCars.length,
      suvMonthly: this.displayedMonthlySuvCars.length
    });
  }

  /**
   * تهيئة كل Swiper على حدة
   */
  private initializeSwipers() {
    const swiperIds = ['slider1', 'slider2', 'slider3', 'slider4'];
    
    swiperIds.forEach(id => {
      const swiperEl = document.querySelector(`#${id}`) as SwiperElement;
      if (swiperEl && !this.swiperElements.has(id)) {
        
        const swiperParams = {
          slidesPerView: 1.5,
          spaceBetween: 5,
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

        Object.assign(swiperEl, swiperParams);

        const prevBtn = document.querySelector(`.${id.replace('slider', 'slider')}-prev`);
        const nextBtn = document.querySelector(`.${id.replace('slider', 'slider')}-next`);
        
        if (prevBtn && nextBtn) {
          Object.assign(swiperEl, {
            navigation: {
              prevEl: prevBtn,
              nextEl: nextBtn,
            }
          });
        }

        swiperEl.initialize();
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
    return this.displayedDailyEconomicCars?.length > 0 ||
           this.displayedDailySuvCars?.length > 0 ||
           this.displayedMonthlyEconomicCars?.length > 0 ||
           this.displayedMonthlySuvCars?.length > 0;
  }

  /**
   * دالة مساعدة للـ *ngFor مع trackBy لتحسين الأداء
   */
  trackByCarId(index: number, car: Car): number {
    return car?.id || index;
  }

  // ========== دوال عرض بيانات السيارة ==========
  
  getCarPrice(car: Car, periodType: 'daily' | 'monthly' = 'daily'): number {
    if (!car?.details?.length) return 0;
    
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

  getFormattedPrice(
    car: Car,
    periodType: 'daily' | 'monthly' = 'daily',
  ): string {
    const price = this.getCarPrice(car, periodType);
    return price?.toString() || '0';
  }

  getCarPickupTime(car: Car): string {
    if (car?.details?.[0]?.office?.quick_policy) {
      return (
        car.details[0].office.quick_policy.pickup_within_hour_text ||
        'استلام خلال ساعة'
      );
    }
    return 'استلام خلال ساعة';
  }

  getCarKilometers(car: Car): string {
    if (car?.details?.[0]?.office?.quick_policy) {
      return (
        car.details[0].office.quick_policy.km_limit_text || '200 كم / يومياً'
      );
    }
    return '200 كم / يومياً';
  }

  getCarFeaturesText(car: Car): string {
    if (car?.features && car.features.trim() !== '') {
      return car.features.trim();
    }
    return '';
  }

  getCarDeductibleText(car: Car): string {
    if (car?.details?.[0]?.office?.quick_policy) {
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