import { Component, OnInit } from '@angular/core';
import { Car } from '../../services/car.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  
  // متغيرات لتخزين بيانات السيارات (ستأتي من sessionStorage)
  dailyEconomicCars: Car[] = [];
  dailySuvCars: Car[] = [];
  monthlyEconomicCars: Car[] = [];
  monthlySuvCars: Car[] = [];
  
  // لا حاجة لـ isLoading هنا لأنه يتم التحكم به في app.component
  isLoading = false;

  constructor() {}

  ngOnInit() {
    console.log('🏠 HomeComponent initialized');
    
    // استرجاع البيانات من sessionStorage (التي تم تخزينها في app.component)
    this.loadDataFromStorage();
  }

  /**
   * Load car data from sessionStorage
   */
  loadDataFromStorage() {
    const storedData = sessionStorage.getItem('carsData');
    
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        this.dailyEconomicCars = data.dailyEconomicCars || [];
        this.dailySuvCars = data.dailySuvCars || [];
        this.monthlyEconomicCars = data.monthlyEconomicCars || [];
        this.monthlySuvCars = data.monthlySuvCars || [];
        
        console.log('✅ تم تحميل بيانات السيارات من sessionStorage');
        console.log('السيارات الاقتصادية اليومية:', this.dailyEconomicCars.length);
        console.log('السيارات المتوسطة اليومية:', this.dailySuvCars.length);
        console.log('السيارات الاقتصادية الشهرية:', this.monthlyEconomicCars.length);
        console.log('السيارات المتوسطة الشهرية:', this.monthlySuvCars.length);
      } catch (e) {
        console.error('❌ خطأ في قراءة البيانات من sessionStorage:', e);
      }
    } else {
      console.log('⚠️ لا توجد بيانات في sessionStorage، في انتظار البيانات من app.component');
      // إذا لم تكن البيانات موجودة، انتظر قليلاً ثم حاول مرة أخرى
      setTimeout(() => {
        this.loadDataFromStorage();
      }, 500);
    }
  }
}