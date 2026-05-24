import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Settings {
  id: number;
  name: string;
  email: string;
  phone: string;
  facebook: string;
  instagram: string;
  snapchat: string;
  tik_tok: string;
  pinterest: string;
  fav_icon: string;
  light_logo: string;
  dark_logo: string;
  no_data_icon: string;
  default_user: string;
  login_background: string;
  hover_color: string;
  color: string;
  address: string;
  privacy_policy: string;
  terms_and_conditions: string;
  created_at: string;
  updated_at: string;
}

export interface SettingsResponse {
  result: boolean;
  errNum: number;
  message: string;
  data: Settings;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = 'https://dev.tareqalqeyada.sa/api/settings';
  private settingsCache: Settings | null = null;

  constructor(private http: HttpClient) { }

  getSettings(): Observable<Settings> {
    if (this.settingsCache) {
      return new Observable(observer => {
        observer.next(this.settingsCache!);
        observer.complete();
      });
    }

    return this.http.get<SettingsResponse>(this.apiUrl).pipe(
      map(response => {
        if (response.result && response.data) {
          this.settingsCache = response.data;
          return response.data;
        }
        throw new Error('Failed to load settings');
      })
    );
  }

  clearCache() {
    this.settingsCache = null;
  }

  getWhatsAppUrl(phone: string): string {
    // Remove any non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    // If phone doesn't start with country code, add 966 (Saudi Arabia)
    const phoneNumber = cleanPhone.startsWith('966') ? cleanPhone : `966${cleanPhone}`;
    return `https://wa.me/${phoneNumber}`;
  }
}
