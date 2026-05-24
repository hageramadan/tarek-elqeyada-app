import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Category {
  id: number;
  name: string;
  description: string;
  status: string;
  is_sub_category: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  parent_id: number | null;
  image_url: string;
  children: Category[];
}

export interface CategoriesResponse {
  result: boolean;
  errNum: number;
  message: string;
  data: {
    categories: Category[];
  };
}

export interface CarCategory {
  id: number;
  name: string;
  image_url: string;
  status: string;
}

export interface CarCategoriesResponse {
  result: boolean;
  errNum: number;
  message: string;
  data: {
    data: CarCategory[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = 'https://dev.tareqalqeyada.sa/api/categories';
  private carCategoriesApiUrl = 'https://dev.tareqalqeyada.sa/api/v2/car-categories';

  constructor(private http: HttpClient) { }
 
  getCategories(): Observable<Category[]> {
    return this.http.get<CategoriesResponse>(this.apiUrl).pipe(
      map(response => response.data.categories || [])
    );
  } 

  getCarCategories(): Observable<CarCategory[]> {
    return this.http.get<CarCategoriesResponse>(this.carCategoriesApiUrl).pipe(
      map(response => response.data.data || [])
    );
  }
}
