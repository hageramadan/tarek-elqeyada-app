import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LoginRequest {
  country_code: string;
  phone: string;
}

export interface RegisterRequest {
  country_code: string;
  phone: string;
}

export interface OTPVerifyRequest {
  country_code: string;
  phone: string;
  otp: string;
}

export interface User {
  id: number;
  name: string | null;
  phone: string;
  country_code: string;
  email: string | null;
  image: string;
  national_id: string | null;
  license_image: string;
  is_active: number;
  is_blocked: number;
  user_type: number;
  locale: string;
  notify_status: number;
  otp: string | null;
  token: string;
}

export interface AuthResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: {
    user?: User;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://dev.tareqalqeyada.sa/api/user';

  constructor(private http: HttpClient) { }

  login(country_code: string, phone: string): Observable<AuthResponse> {
    // Remove leading zero from phone if exists
    const cleanedPhone = this.removeLeadingZero(phone);
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { 
      country_code,
      phone: cleanedPhone
    });
  }

  register(country_code: string, phone: string): Observable<AuthResponse> {
    // Remove leading zero from phone if exists
    const cleanedPhone = this.removeLeadingZero(phone);
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, { 
      country_code,
      phone: cleanedPhone
    });
  }

  verifyOTP(country_code: string, phone: string, otp: string): Observable<AuthResponse> {
    // Remove leading zero from phone if exists
    const cleanedPhone = this.removeLeadingZero(phone);
    // Always send 1234 to API regardless of what user typed
    return this.http.post<AuthResponse>(`${this.apiUrl}/verify/otp`, {
      country_code,
      phone: cleanedPhone,
      otp: '1234'
    });
  }

  /**
   * Complete registration with additional user information
   */
  completeRegistration(formData: FormData): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/complete/registration`, formData);
  }

  // Helper function to remove leading zero from phone number
  removeLeadingZero(phone: string): string {
    if (phone && phone.startsWith('0')) {
      return phone.substring(1);
    }
    return phone;
  }
}
