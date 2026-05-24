import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get token from localStorage
    const token = localStorage.getItem('auth_token');

    // Clone the request and add the Authorization header if token exists
    if (token) {
      const clonedRequest = req.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`
        }
      });
      return next.handle(clonedRequest);
    }

    // If no token, pass the original request
    return next.handle(req);
  }
}
