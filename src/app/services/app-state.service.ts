import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  private isLoadingSubject = new BehaviorSubject<boolean>(true); // تأكد أنها true
  isLoading$ = this.isLoadingSubject.asObservable();

  setLoading(isLoading: boolean) {
    console.log('📢 Setting loading to:', isLoading);
    this.isLoadingSubject.next(isLoading);
  }

  hideLoader() {
    console.log('📢 Hiding loader');
    this.isLoadingSubject.next(false);
  }
}