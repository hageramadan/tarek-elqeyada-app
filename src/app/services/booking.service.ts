import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BookingRequest {
  email?: string;
  amount: number;
  address: string;
  zip?: string;
  city: string;
  uuid?: string;
  rental_company_id: number;
  car_id: number;
  category_id: number;
  payment_method_id?: number;
  index?: number;
  booking_type: string;
  start_date: string;
  start_time: string;
  total_days: number;
  rental_company_car_period_id?: number;
  delivery_type: string;
  delivery_address: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  additional_services?: any[];
  insurance_type_id?: number;
  coupon_code?: string;
}

export interface BookingResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: any;
}

export interface Booking {
  id: number;
  identification_number: string;
  booking_type: string;
  start_date: string;
  start_time: string;
  end_date?: string;
  end_time?: string;
  total_days: number;
  base_price: string;
  discount_amount: string;
  coupon_discount: string;
  tax_amount: string;
  total_amount: string;
  status: string;
  status_label: string;
  status_number: number;
  is_extended: number;
  payment_status: string;
  delivery_type: string;
  delivery_address: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  created_at: string;
  rental_company?: {
    id: number;
    name: string;
    image: string;
    average_rating: number;
    count_reviews: number;
  };
  quick_policy?: {
    id: number;
    pickup_within_hour_text: string;
    deductible_text: string;
    km_limit_text: string;
    status: string;
  };
  category?: {
    id: number;
    name: string;
  };
  car?: {
    id: number;
    name: string;
    imageUrl: string;
    brand?: {
      id: number;
      name: string;
    };
  };
  payment_method?: {
    id: number;
    name: string;
  };
  coupon?: any;
}

export interface BookingsResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: {
    bookings?: Booking[];
    statistics?: {
      total: number;
      current: number;
      completed: number;
      upcoming: number;
      ongoing: number;
      by_type: {
        daily: number;
        monthly: number;
        yearly: number;
      };
      by_status: {
        pending: number;
        confirmed: number;
        completed: number;
        cancelled: number;
      };
    };
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
}

export interface BookingStatisticsResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: {
    total?: number;
    current?: number;
    completed?: number;
    cancelled?: number;
  };
}

export interface ExtendBookingRequest {
  extension_days: number;
}

export interface ExtendBookingResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: any;
}

export interface AvailableExtensionDaysResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: {
    extension_days?: number;
    available_days?: number;
  };
}

export interface CalculatePriceRequest {
  booking_type: string;
  rental_company_id: number;
  start_date: string;
  count: number;
  car_id: number;
  start_time: string;
}

export interface CalculatePriceResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: {
    base_price: number;
    additional_services_total: number;
    additional_services: any[];
    insurance: any;
    discount_amount: number;
    coupon_discount: number;
    tax_amount: number;
    total_amount: number;
    monthly_payments: any;
    payment_date: any;
    total_days: number;
    end_date: string;
    end_time: string;
    price_breakdown: {
      base_price: number;
      additional_services_total: number;
      delivery_fees: number;
      insurance_price: number;
      discount: number;
      coupon_discount: number;
      subtotal: number;
      tax: number;
      total: number;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private apiUrl = 'https://dev.tareqalqeyada.sa/api/bookings';

  constructor(private http: HttpClient) { }

  createBooking(booking: BookingRequest): Observable<BookingResponse> {
    // Build parameters object, only including non-empty/non-zero values
    const params: any = {
      amount: booking.amount,
      address: booking.address,
      city: booking.city,
      rental_company_id: booking.rental_company_id,
      car_id: booking.car_id,
      category_id: booking.category_id,
      booking_type: booking.booking_type,
      start_date: booking.start_date,
      start_time: booking.start_time,
      total_days: String(booking.total_days), // Convert to string as API expects
      delivery_type: booking.delivery_type,
      delivery_address: booking.delivery_address
    };

    if (booking.email) {
      params.email = booking.email;
    }
    if (booking.zip) {
      params.zip = booking.zip;
    }
    if (booking.uuid) {
      params.uuid = booking.uuid;
    }
    if (booking.payment_method_id) {
      params.payment_method_id = booking.payment_method_id;
    }
    if (booking.index !== undefined) {
      params.index = booking.index;
    }
    // Always include rental_company_car_period_id if it's provided (even for daily bookings)
    if (booking.rental_company_car_period_id !== undefined && booking.rental_company_car_period_id !== null) {
      params.rental_company_car_period_id = booking.rental_company_car_period_id;
    }
    if (booking.delivery_latitude) {
      params.delivery_latitude = booking.delivery_latitude;
    }
    if (booking.delivery_longitude) {
      params.delivery_longitude = booking.delivery_longitude;
    }
    // API expects additional_services to always be present
    // Format additional_services with count field if provided
    if (booking.additional_services && Array.isArray(booking.additional_services) && booking.additional_services.length > 0) {
      // Format additional_services with count field - ensure each service has id and count
      params.additional_services = booking.additional_services.map((service: any) => {
        if (typeof service === 'object' && service !== null && service.id) {
          // Ensure count field exists and is a number
          return {
            id: Number(service.id),
            count: service.count !== undefined && service.count !== null ? Number(service.count) : 1
          };
        }
        // If service format is invalid, skip it
        return null;
      }).filter((service: any) => service !== null); // Remove any null entries
    } else {
      // API expects additional_services to always be present
      // Try sending as null - some APIs expect null instead of empty array
      params.additional_services = null;
    }
    
    // Only include insurance_type_id if it's provided and valid (not 0)
    if (booking.insurance_type_id && booking.insurance_type_id > 0) {
      params.insurance_type_id = booking.insurance_type_id;
    }
    if (booking.coupon_code && booking.coupon_code.trim() !== '') {
      params.coupon_code = booking.coupon_code;
    }

    // Add count field to request (API expects this field)
    // Count should be dynamic: number of days for daily bookings, number of months for monthly bookings
    if (booking.booking_type === 'monthly' || booking.booking_type === 'شهري') {
      // For monthly bookings, count is the number of months
      // Calculate months from total_days (assuming 30 days per month)
      const months = Math.ceil(booking.total_days / 30);
      params.count = String(months);
    } else {
      // For daily bookings, count is the number of days
      params.count = String(booking.total_days);
    }



    return this.http.post<BookingResponse>(this.apiUrl, params);
  }

  /**
   * Get all bookings for the current user
   */
  getBookings(): Observable<BookingsResponse> {
    return this.http.get<BookingsResponse>(this.apiUrl);
  }

  /**
   * Get booking statistics
   */
  getBookingStatistics(): Observable<BookingStatisticsResponse> {
    return this.http.get<BookingStatisticsResponse>(`${this.apiUrl}/statistics`);
  }

  /**
   * Cancel a booking
   */
  cancelBooking(bookingId: number): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(`${this.apiUrl}/${bookingId}/cancel`, {});
  }

  /**
   * Extend a booking
   */
  extendBooking(bookingId: number, extensionDays: number): Observable<ExtendBookingResponse> {
    return this.http.post<ExtendBookingResponse>(`${this.apiUrl}/${bookingId}/extend`, {
      extension_days: extensionDays
    });
  }

  /**
   * Check available extension days for a booking
   */
  checkAvailableExtensionDays(bookingId: number, extensionDays: number): Observable<AvailableExtensionDaysResponse> {
    return this.http.post<AvailableExtensionDaysResponse>(`${this.apiUrl}/${bookingId}/available-extension-days`, {
      extension_days: extensionDays
    });
  }

  /**
   * Check extension for a booking
   */
  checkExtension(bookingId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${bookingId}/check-extension`);
  }

  /**
   * Get booking by ID
   */
  getBookingById(bookingId: number): Observable<BookingResponse> {
    return this.http.get<BookingResponse>(`${this.apiUrl}/${bookingId}`);
  }

  /**
   * Calculate booking price
   */
  calculatePrice(request: CalculatePriceRequest): Observable<CalculatePriceResponse> {
    return this.http.post<CalculatePriceResponse>(`${this.apiUrl}/calculate-price`, request);
  }

  /**
   * Get booking terms
   */
  getBookingTerms(): Observable<any> {
    return this.http.get<any>('https://dev.tareqalqeyada.sa/api/booking-terms');
  }
}
