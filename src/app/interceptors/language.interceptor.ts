import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class LanguageInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Clone the request and add the Accept-Language header
    const clonedRequest = req.clone({
      setHeaders: {
        'Accept-Language': 'ar'
      }
    });

    // Pass the cloned request to the next handler
    return next.handle(clonedRequest);
  }
}
