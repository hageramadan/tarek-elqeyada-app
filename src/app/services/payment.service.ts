import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

export interface PaymentMethod {
  id: number;
  name: string;
  icon?: string;
  image?: string; // URL from API
  index?: number;
  type?: string; // 'apple_pay', 'card', 'tabby', 'tamara', 'cash', 'mispay'
  status?: string;
  fee?: number | null;
}

export interface PaymentMethodsResponse {
  result?: boolean;
  errNum?: number;
  message?: string;
  data?: {
    services?: Array<{
      id: number;
      name: string;
      status: string;
      fee: number | null;
      image: string;
    }>;
  };
}

export interface PaymentCheckoutRequest {
  amount: number;
  payment_method: number;
  index: number;
  address: string;
  city: string;
  car_name: string;
  zip: string;
  uuid: string;
  booking_id?: number;
}

export interface PaymentCheckoutResponse {
  result?: boolean;
  errNum?: number;
  message?: string;
  client_secret?: string;
  payment_token?: string;
  payment_methods?: Array<any>;
  status?: string;
  confirmed?: boolean;
  created?: string;
  object?: string;
  data?: {
    payment?: {
      payment_keys?: Array<{
        redirection_url?: string;
        order_id?: number;
        integration?: number;
        key?: string;
        gateway_type?: string;
        iframe_id?: string;
      }>;
      intention_order_id?: number;
      id?: string;
      client_secret?: string;
      payment_token?: string;
      confirmed?: boolean;
      status?: string;
      configuration?: {
        available_products?: {
          installments?: Array<{
            web_url?: string;
            qr_code?: string;
          }>;
        };
      };
      order_id?: string;
      checkout_id?: string;
      checkout_url?: string;
    };
    payment_url?: string;
    redirect_url?: string;
    web_url?: string;
    checkout_url?: string;
  };
  payment_url?: string;
  redirect_url?: string;
  checkout_url?: string;
  tabby_url?: string;
  web_url?: string;
  tamara_url?: string;
}

export interface CashPaymentRequest {
  booking_id: number | string;
  amount: number;
}

export interface CashPaymentResponse {
  result: boolean;
  errNum: number;
  message: string;
  data?: {
    booking_id: number;
    status: string;
    amount: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private baseUrl = 'https://dev.tareqalqeyada.sa/api';
  private tabbyApiKey = 'pk_test_0199f4dc-32dc-82fb-7fe2-607843864d96';
  private tabbyMerchantCode = 'masheeha';
  
  // PayMob Configuration
  PAYMOB_SECRET_KEY = 'sau_sk_live_1de9051cb4f386de2fc87261c2552212a6cb2252a975138b9a0a6a944133a774';
  PAYMOB_PUBLIC_KEY = 'sau_pk_live_8Dza5gChMSVJbnsKtWKJOTs8jlQz6ZEW';
  PAYMOB_INTEGRATION_IDS = [14606, 14607];

  // Payment method mapping
  private readonly PAYMENT_METHOD_MAP: { [key: number]: { index: number, type: string } } = {
    1: { index: 0, type: 'apple_pay' },   // Apple Pay
    6: { index: 1, type: 'card' },        // Visa/Mastercard
    8: { index: 1, type: 'card' },        // Mada
    11: { index: 3, type: 'tamara' },     // Tamara
    12: { index: 4, type: 'cash' },       // Cash on Delivery
    13: { index: 2, type: 'mispay' }      // MISpay
  };

  constructor(private http: HttpClient) { }

  /**
   * Get available payment methods from API
   */
  getPaymentMethods(): Observable<PaymentMethod[]> {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.get<PaymentMethodsResponse>(`${this.baseUrl}/payment-methods`, { headers }).pipe(
      map(response => {
        
        let methods: any[] = [];
        
        if (response.data?.services && Array.isArray(response.data.services)) {
          methods = response.data.services;
        } else if (response.data && Array.isArray(response.data)) {
          methods = response.data;
        } else if (response.data && (response.data as any).data && Array.isArray((response.data as any).data)) {
          methods = (response.data as any).data;
        } else if (Array.isArray(response)) {
          methods = response;
        } else if (response.data && (response.data as any).payment_methods && Array.isArray((response.data as any).payment_methods)) {
          methods = (response.data as any).payment_methods;
        }
        
        if (methods && methods.length > 0) {
          return methods
            .filter((method: any) => {
              if (method.status !== 'active') return false;
              return true; // Keep all active methods including Tabby
            })
            .map((method: any) => {
              const methodId = method.id || method.payment_method_id || method.payment_method?.id;
              const methodName = method.name || method.title || method.payment_method?.name || '';
              const mapping = this.getMethodMappingById(methodId);
              
              return {
                id: methodId,
                name: methodName,
                icon: method.icon || this.getDefaultIcon(undefined, methodName),
                image: method.image || undefined,
                index: mapping.index,
                type: mapping.type,
                status: method.status,
                fee: method.fee
              };
            });
        }
        
        return [];
      }),
      catchError(error => {
        console.error('Error fetching payment methods:', error);
        return of([]);
      })
    );
  }

  /**
   * Get method mapping by ID
   */
  private getMethodMappingById(id: number): { index: number, type: string } {
    return this.PAYMENT_METHOD_MAP[id] || { index: 1, type: 'card' };
  }

  /**
   * Get index from payment method ID (fallback)
   */
  private getIndexFromId(id: number): number {
    return this.PAYMENT_METHOD_MAP[id]?.index ?? 1;
  }

  /**
   * Process payment checkout
   */
  processCheckout(request: PaymentCheckoutRequest): Observable<PaymentCheckoutResponse> {
    const apiUrl = `${this.baseUrl}/pay/checkout`;
    
    const requestBody: any = {
      amount: request.amount,
      index: request.index,
      address: request.address,
      city: request.city,
      car_name: request.car_name,
      zip: request.zip,
      uuid: request.uuid,
      payment_method: request.payment_method
    };
    
    if (request.booking_id) {
      requestBody.booking_id = request.booking_id;
    }
    
    
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.post<PaymentCheckoutResponse>(apiUrl, requestBody, { headers });
  }

  /**
   * Process cash on delivery payment
   */
  processCashPayment(request: CashPaymentRequest): Observable<CashPaymentResponse> {
    const apiUrl = `${this.baseUrl}/booking/confirm-cash`;
    
    const requestBody = {
      booking_id: request.booking_id,
      amount: request.amount,
      payment_method: 'cash'
    };
    
    
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.post<CashPaymentResponse>(apiUrl, requestBody, { headers });
  }

  /**
   * Get payment checkout URL (alternative endpoint that returns URL directly)
   */
  getPaymentCheckoutUrl(paymentId: string): Observable<any> {
    const url1 = `${this.baseUrl}/pay/url/${paymentId}`;
    const url2 = `${this.baseUrl}/pay/${paymentId}`;
    
    return this.http.get<any>(url1).pipe(
      catchError(() => {
        return this.http.get<any>(url2).pipe(
          catchError(() => {
            return of({});
          })
        );
      })
    );
  }

  /**
   * Check payment status by order ID
   */
  checkPaymentStatus(orderId: number): Observable<any> {
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.get<any>(`${this.baseUrl}/pay/status/${orderId}`, { headers });
  }

  /**
   * Check payment status by payment ID
   */
  checkPaymentStatusByPaymentId(paymentId: string): Observable<any> {
    const successUrl = `${this.baseUrl}/payment/success?payment_id=${paymentId}`;
    const token = localStorage.getItem('auth_token');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    
    return this.http.get<any>(successUrl, { headers });
  }

  /**
   * Get payment method info by ID
   */
  getPaymentMethodInfo(methodId: number): { paymentMethodId: number, index: number, type: string } {
    const mapping = this.getMethodMappingById(methodId);
    return {
      paymentMethodId: methodId,
      index: mapping.index,
      type: mapping.type
    };
  }

  /**
   * Extract payment URL from checkout response
   */
  extractPaymentUrl(response: PaymentCheckoutResponse): string | null {
    
    // Check for Paymob response
    if (response.data?.payment) {
      const payment = response.data.payment;
      const clientSecret = payment.client_secret;
      
      if (payment.payment_keys && payment.payment_keys.length > 0) {
        const paymentKey = payment.payment_keys[0];
        if (paymentKey.redirection_url) {
          return `${paymentKey.redirection_url}?client_secret=${clientSecret}`;
        }
      }
    }
    
    // Check for direct client_secret
    if (response.client_secret) {
      return this.getPaymobPaymentUrl(response.client_secret);
    }
    
    // Check for Tabby response
    if (response.web_url) {
      return response.web_url;
    }
    if (response.data?.web_url) {
      return response.data.web_url;
    }
    if (response.data?.payment?.configuration?.available_products?.installments?.[0]?.web_url) {
      return response.data.payment.configuration.available_products.installments[0].web_url;
    }
    
    // Check for Tamara response
    if (response.checkout_url) {
      return response.checkout_url;
    }
    if (response.data?.checkout_url) {
      return response.data.checkout_url;
    }
    if (response.data?.payment?.checkout_url) {
      return response.data.payment.checkout_url;
    }
    
    // Check for redirect_url
    if (response.redirect_url) {
      return response.redirect_url;
    }
    if (response.payment_url) {
      return response.payment_url;
    }
    if (response.data?.redirect_url) {
      return response.data.redirect_url;
    }
    if (response.data?.payment_url) {
      return response.data.payment_url;
    }
    
    return null;
  }

  /**
   * Get Paymob payment URL
   */
  getPaymobPaymentUrl(clientSecret: string, iframeId: number = 14606): string {
    return `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?client_secret=${clientSecret}`;
  }

  /**
   * Get Tabby checkout URL
   */
  getTabbyCheckoutUrl(price: number, lang: string = 'ar'): string {
    const formattedPrice = this.formatPrice(price);
    return `https://checkout.tabby.ai/promos/product-page/installments/${lang}/?price=${formattedPrice}&currency=SAR&merchant_code=${this.tabbyMerchantCode}&public_key=${this.tabbyApiKey}`;
  }

  /**
   * Get Tabby widget URL
   */
  getTabbyWidgetUrl(price: number, lang: string = 'ar'): string {
    const formattedPrice = this.formatPrice(price);
    return `https://widgets.tabby.ai/tabby-promo.html?price=${formattedPrice}&currency=SAR&lang=${lang}&publicKey=${this.tabbyApiKey}&merchant_code=${this.tabbyMerchantCode}`;
  }

  /**
   * Format price to 2 decimal places
   */
  private formatPrice(price: number): string {
    return price.toFixed(2);
  }

  /**
   * Get payment type based on index or name
   */
  private getPaymentType(index?: number, name?: string): string {
    if (index !== undefined) {
      switch (index) {
        case 0:
          return 'apple_pay';
        case 1:
          return 'card';
        case 2:
          return 'mispay';
        case 3:
          return 'tamara';
        case 4:
          return 'cash';
        default:
          return 'card';
      }
    }
    
    if (name) {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('أدفع نقدا') || lowerName.includes('cash on delivery') || lowerName.includes('نقدا')) {
        return 'cash';
      }
      if (lowerName.includes('apple') || lowerName.includes('ابل')) {
        return 'apple_pay';
      }
      if (lowerName.includes('tabby') || lowerName.includes('تابي')) {
        return 'tabby';
      }
      if (lowerName.includes('tamara') || lowerName.includes('تمارا')) {
        return 'tamara';
      }
      if (lowerName.includes('mispay')) {
        return 'mispay';
      }
      if (lowerName.includes('card') || lowerName.includes('فيزا') || lowerName.includes('ماستر') || lowerName.includes('مدى')) {
        return 'card';
      }
    }
    
    return 'card';
  }

  /**
   * Get default icon name based on payment method
   */
  private getDefaultIcon(index?: number, name?: string): string {
    const type = this.getPaymentType(index, name);
    switch (type) {
      case 'apple_pay':
        return 'apple-pay';
      case 'tabby':
        return 'tabby';
      case 'tamara':
        return 'tamara';
      case 'mispay':
        return 'mispay';
      case 'cash':
        return 'cash';
      case 'card':
      default:
        if (name && name.toLowerCase().includes('مدى')) {
          return 'mada';
        }
        return 'visa-mastercard';
    }
  }

  /**
   * Check if payment method requires redirect
   */
  requiresRedirect(paymentType: string): boolean {
    return ['tabby', 'tamara', 'mispay', 'apple_pay'].includes(paymentType);
  }

  /**
   * Check if payment method is web-based
   */
  isWebBased(paymentType: string): boolean {
    return ['tabby', 'tamara', 'mispay'].includes(paymentType);
  }

  /**
   * Check if payment method is cash on delivery
   */
  isCashPayment(paymentType: string): boolean {
    return paymentType === 'cash';
  }
}