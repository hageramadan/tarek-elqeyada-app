import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ToastrModule } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { AppComponent } from './app.component';

import { NavbarComponent } from './component/global/navbar/navbar.component';
import { LoadingScreenComponent } from './component/global/loading-screen/loading-screen.component';
import { HomeComponent } from './component/home/home.component';
import { HomeHeaderComponent } from './component/home/home-header/home-header.component';
import { CarCategoriesComponent } from './component/home/car-categories/car-categories.component';
import { AppDownloadComponent } from './component/home/app-download/app-download.component';
import { FooterComponent } from './component/global/footer/footer.component';
import { CarsComponent } from './component/cars/cars.component';
import { LoginComponent } from './component/auth/login/login.component';
import { RegisterComponent } from './component/auth/register/register.component';
import { OtpVerifyComponent } from './component/auth/otp-verify/otp-verify.component';
import { BookingComponent } from './component/booking/booking.component';
import { BookingConfirmationComponent } from './component/booking/booking-confirmation.component';
import { ProfileComponent } from './component/profile/profile.component';
import { BookingDetailsComponent } from './component/profile/booking-details/booking-details.component';
import { ExtendBookingComponent } from './component/profile/extend-booking/extend-booking.component';
import { ConfirmationModalComponent } from './component/shared/confirmation-modal/confirmation-modal.component';
import { PrivacyPolicyComponent } from './component/privacy-policy/privacy-policy.component';
import { TermsAndConditionsComponent } from './component/terms-and-conditions/terms-and-conditions.component';
import { BookingPageComponent } from './component/booking-page/booking-page.component'; 
import { AppRoutingModule } from './app-routing.module';
import { LanguageInterceptor } from './interceptors/language.interceptor';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { register } from 'swiper/element/bundle';

register();
@NgModule({
  declarations: [
    AppComponent ,
    NavbarComponent,
    LoadingScreenComponent,
    HomeComponent,
    HomeHeaderComponent,
    CarCategoriesComponent,
    AppDownloadComponent,
    FooterComponent,
    CarsComponent,
    LoginComponent,
    RegisterComponent,
    OtpVerifyComponent,
    BookingComponent,
    BookingConfirmationComponent,
    ProfileComponent,
    BookingDetailsComponent,
    ExtendBookingComponent,
    ConfirmationModalComponent,
    PrivacyPolicyComponent,
    TermsAndConditionsComponent,
    BookingPageComponent,
    
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    ReactiveFormsModule,
    FormsModule,
    CommonModule,
    AppRoutingModule,
    ToastrModule.forRoot({
      positionClass: 'toast-top-center',
      timeOut: 3000,
      closeButton: true,
      progressBar: true,
      enableHtml: true
    })
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LanguageInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule {}
 