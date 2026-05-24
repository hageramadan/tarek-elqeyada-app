import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './component/home/home.component';
import { CarsComponent } from './component/cars/cars.component';
import { ProfileComponent } from './component/profile/profile.component';
import { PrivacyPolicyComponent } from './component/privacy-policy/privacy-policy.component';
import { TermsAndConditionsComponent } from './component/terms-and-conditions/terms-and-conditions.component';
import { BookingPageComponent } from './component/booking-page/booking-page.component';
import { OtpVerifyComponent } from './component/auth/otp-verify/otp-verify.component';
import { BookingReviewComponent } from './pages/booking-review/booking-review.component';
import { BookingDetailsComponent } from './component/profile/booking-details/booking-details.component';
const routes: Routes = [
  {path: '', redirectTo: '/home', pathMatch: 'full'},
  {path: 'home', component: HomeComponent},
  {path: 'cars', component: CarsComponent},
   { path: 'otp', component: OtpVerifyComponent },
  {path: 'profile', component: ProfileComponent},
  {path: 'privacy-policy', component: PrivacyPolicyComponent},
  {path: 'terms-and-conditions', component: TermsAndConditionsComponent},
   {path: 'booking/:carId', component: BookingPageComponent},
    { path: 'booking-review', component: BookingReviewComponent },
     { 
    path: 'booking-details/:id', 
    component: BookingDetailsComponent
  },
  { 
    path: 'booking-details', 
    component: BookingDetailsComponent 
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
