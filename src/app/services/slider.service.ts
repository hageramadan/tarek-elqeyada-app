import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SliderItem {
  id: number;
  title: string;
  url: string;
  image: string;
}

export interface SliderResponse {
  result: boolean;
  errNum: number;
  message: string;
  data: {
    addresses: SliderItem[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class SliderService {
  private apiUrl = 'https://dev.tareqalqeyada.sa/api/user/sliders';

  constructor(private http: HttpClient) { }

  getSliders(): Observable<SliderItem[]> {
    return this.http.get<SliderResponse>(this.apiUrl).pipe(
      map(response => response.data.addresses || [])
    );
  }
}
