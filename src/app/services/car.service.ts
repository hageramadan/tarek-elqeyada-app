import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface CarBrand {
  id: number;
  name: string;
  description: string;
  status: string;
  image_url: string;
}

export interface CarCategory {
  id: number;
  name: string;
  description: string | null;
}

export interface CarDetail {
  id: number;
  car_id: number;
  rental_company_id: number;
  price_per_day: number;
  discount: number | null;
  is_featured: number;
  status: string;
  delivery_to_your_place: number;
  receipt_from_branch: number;
  office: any;
  additional_services: any[];
  insurance_types: any[];
  periods: any[];
}

export interface Car {
  id: number;
  name: string;
  features: string | null;
  popular: number;
  model_year: string;
  transmission: string;
  fuel_type: string;
  seats: number;
  doors: number;
  luggage: number;
  rating: string | null;
  image_url: string;
  brand: CarBrand;
  car_category: CarCategory;
  details: CarDetail[];
}

export interface CarsResponse {
  result: boolean;
  errNum: number;
  message: string;
  data: {
    cars: Car[];
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class CarService {
  private apiUrl = 'https://dev.tareqalqeyada.sa/api/v2/cars';

  constructor(private http: HttpClient) { }

  getCars(popular: number = 0, carCategoryId?: number, periodType?: string): Observable<Car[]> {
    let params = new HttpParams().set('popular', popular.toString());
    
    if (carCategoryId !== undefined && carCategoryId !== null) {
      params = params.set('car_category_id', carCategoryId.toString());
    }
    
    if (periodType) {
      params = params.set('period_type', periodType);
    }

    return this.http.get<CarsResponse>(this.apiUrl, { params }).pipe(
      map(response => response.data.cars || [])
    );
  }

 // عدل الدالة الموجودة
getCarById(id: number): Observable<Car | null> {
  return this.http.get<any>(`${this.apiUrl}/${id}`).pipe(
    map(response => {
      // من الـ response اللي عندي: response.data.data
      if (response.result && response.data?.data) {
        return response.data.data as Car;
      }
      // fallback للشكل القديم
      if (response.data?.cars?.[0]) {
        return response.data.cars[0];
      }
      return null;
    })
  );
}

  // أضف هذه الدالة الجديدة (الأفضل)
  getCar(id: number): Observable<Car> {
    return this.http.get<{ result: boolean; data: { car: Car } }>(`${this.apiUrl}/${id}`).pipe(
      map(response => response.data.car)
    );
  }

  // أضف هذه الدوال في ملف car.service.ts

/**
 * جلب السيارات حسب معرف الفئة ونوع الفترة (يومي/شهري)
 * @param categoryId معرف الفئة (1 = اقتصادي, 6 = SUV)
 * @param periodType نوع الفترة (daily أو monthly)
 */
getCarsByCategoryAndPeriod(categoryId: number, periodType: string): Observable<Car[]> {
  const url = `https://dev.tareqalqeyada.sa/api/v2/cars?popular=0&car_category_id=${categoryId}&period_type=${periodType}`;
  
  return this.http.get<any>(url).pipe(
    map(response => {
      if (response && response.result === true && response.data && response.data.cars) {
        // تحويل البيانات القادمة من API إلى مصفوفة سيارات متوافقة مع interface Car
        return response.data.cars.map((carData: any) => this.mapApiCarToCarInterface(carData));
      }
      return [];
    }),
   
  );
}

/**
 * تحويل بيانات السيارة القادمة من API إلى الـ interface Car المستخدم في التطبيق
 */
private mapApiCarToCarInterface(apiCar: any): Car {
  return {
    id: apiCar.id,
    name: apiCar.name,
    features: apiCar.features,
    popular: apiCar.popular,
    model_year: apiCar.model_year,
    transmission: apiCar.transmission,
    fuel_type: apiCar.fuel_type,
    seats: apiCar.seats,
    doors: apiCar.doors,
    luggage: apiCar.luggage,
    rating: apiCar.rating,
    image_url: apiCar.image_url,
    brand: apiCar.brand,
    car_category: apiCar.car_category,
    details: apiCar.details
  } as Car;
}
}

